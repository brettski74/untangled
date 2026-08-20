import type { Pool, PoolClient } from "pg";

import { utc_now } from "./datetime_utc.js";
import { SYSTEM_USER_ID } from "./login_settings.js";
import type { NewUserSession } from "./sessions.js";
import type { LoadedUser, UserRepository } from "./users.js";

export const SELECT_USER_FOR_UPDATE_SQL = `SELECT id::text AS id, username, password_hash, display_name, is_active, failed_login_count, password_expires_at FROM "user" WHERE id = $1::uuid FOR UPDATE`;

type UserLockRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  is_active: boolean;
  failed_login_count: number;
  password_expires_at: Date;
};

type SessionLockRow = {
  id: string;
  user_id: string;
  refresh_hmac: string | null;
  session_expires_at: Date;
  refresh_expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
};

export type LockedChangePasswordTx = {
  user: LoadedUser;
  get_session: (session_id: string) => Promise<NewUserSession | null>;
  apply_password_change: (args: {
    password_hash: string;
    password_expires_at: Date;
    actor_id: string;
  }) => Promise<void>;
  issue_first_refresh: (args: {
    session_id: string;
    refresh_hmac: string;
    refresh_expires_at: Date;
    ip_address: string | null;
    user_agent: string | null;
  }) => Promise<boolean>;
  invalidate_all_sessions: () => Promise<void>;
};

export type ChangePasswordApply = {
  run_locked: <T>(
    user_id: string,
    fn: (tx: LockedChangePasswordTx) => Promise<T>,
  ) => Promise<T | null>;
};

function loaded_user(row: UserLockRow): LoadedUser {
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    display_name: row.display_name,
    is_active: row.is_active,
    failed_login_count: row.failed_login_count,
    password_expires_at: row.password_expires_at,
  };
}

function session_from_row(row: SessionLockRow): NewUserSession {
  return {
    id: row.id,
    user_id: row.user_id,
    refresh_hmac: row.refresh_hmac,
    session_expires_at: row.session_expires_at,
    refresh_expires_at: row.refresh_expires_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
  };
}

function tx_from_client(client: PoolClient, user: LoadedUser): LockedChangePasswordTx {
  const user_id = user.id;
  return {
    user,
    async get_session(session_id) {
      const result = await client.query<SessionLockRow>(
        `SELECT id::text AS id, user_id::text AS user_id, refresh_hmac,
                session_expires_at, refresh_expires_at, ip_address, user_agent
           FROM user_session
          WHERE id = $1::uuid AND user_id = $2::uuid`,
        [session_id, user_id],
      );
      const row = result.rows[0];
      return row == null ? null : session_from_row(row);
    },
    async apply_password_change(args) {
      await client.query(
        'UPDATE "user" SET password_hash = $1, password_expires_at = $2, failed_login_count = 0, updated_at = $3, updated_by = $4::uuid WHERE id = $5::uuid',
        [
          args.password_hash,
          args.password_expires_at,
          utc_now(),
          args.actor_id,
          user_id,
        ],
      );
    },
    async issue_first_refresh(args) {
      const stamped = utc_now();
      const result = await client.query(
        `UPDATE user_session
            SET refresh_hmac = $1,
                refresh_expires_at = $2,
                ip_address = $3,
                user_agent = $4,
                updated_at = $5,
                updated_by = $6::uuid
          WHERE id = $7::uuid AND user_id = $8::uuid AND refresh_hmac IS NULL`,
        [
          args.refresh_hmac,
          args.refresh_expires_at,
          args.ip_address,
          args.user_agent,
          stamped,
          SYSTEM_USER_ID,
          args.session_id,
          user_id,
        ],
      );
      return result.rowCount === 1;
    },
    async invalidate_all_sessions() {
      await client.query(
        `DELETE FROM used_refresh_token WHERE user_id = $1::uuid`,
        [user_id],
      );
      await client.query(`DELETE FROM user_session WHERE user_id = $1::uuid`, [
        user_id,
      ]);
    },
  };
}

export function make_change_password_apply(pool: Pool): ChangePasswordApply {
  return {
    async run_locked(user_id, fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<UserLockRow>(SELECT_USER_FOR_UPDATE_SQL, [
          user_id,
        ]);
        const row = locked.rows[0];
        if (row == null) {
          await client.query("ROLLBACK");
          return null;
        }
        const result = await fn(tx_from_client(client, loaded_user(row)));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep the original failure.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function memory_change_password_apply(
  users: UserRepository,
  sessions: {
    rows: NewUserSession[];
    used: { user_id: string }[];
  },
): ChangePasswordApply {
  return {
    async run_locked(user_id, fn) {
      const user = await users.load_by_id(user_id);
      if (user == null) {
        return null;
      }
      return fn({
        user,
        async get_session(session_id) {
          const row = sessions.rows.find(
            (item) => item.id === session_id && item.user_id === user_id,
          );
          return row == null ? null : { ...row };
        },
        async apply_password_change(args) {
          await users.apply_password_change({
            id: user_id,
            password_hash: args.password_hash,
            password_expires_at: args.password_expires_at,
            actor_id: args.actor_id,
          });
        },
        async issue_first_refresh(args) {
          const row = sessions.rows.find(
            (item) => item.id === args.session_id && item.user_id === user_id,
          );
          if (row == null || row.refresh_hmac != null) {
            return false;
          }
          row.refresh_hmac = args.refresh_hmac;
          row.refresh_expires_at = args.refresh_expires_at;
          row.ip_address = args.ip_address;
          row.user_agent = args.user_agent;
          return true;
        },
        async invalidate_all_sessions() {
          for (let i = sessions.used.length - 1; i >= 0; i -= 1) {
            if (sessions.used[i]?.user_id === user_id) {
              sessions.used.splice(i, 1);
            }
          }
          for (let i = sessions.rows.length - 1; i >= 0; i -= 1) {
            if (sessions.rows[i]?.user_id === user_id) {
              sessions.rows.splice(i, 1);
            }
          }
        },
      });
    },
  };
}
