import type { Pool, PoolClient } from "pg";

import { utc_now } from "./datetime_utc.js";
import { SYSTEM_USER_ID } from "./login_settings.js";
import { rotate_session_times } from "./session_issue.js";
import { new_uuid7 } from "./uuidv7.js";

export type NewUserSession = {
  id: string;
  user_id: string;
  refresh_hmac: string | null;
  session_expires_at: Date;
  refresh_expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
};

export type UsedRefreshRow = {
  refresh_hmac: string;
  user_id: string;
  session_id: string;
  used_at: Date;
  expires_at: Date;
};

export type AttemptRotateArgs = {
  old_hmac: string;
  new_hmac: string;
  user_id: string;
  session_id: string;
  now: Date;
  refresh_ttl_seconds: number;
  reuse_grace_seconds: number;
  reuse_window_seconds: number;
  ip_address: string | null;
  user_agent: string | null;
};

export type AttemptRotateResult =
  | { kind: "rotated"; refresh_expires_at: Date; session_expires_at: Date }
  | { kind: "expired" }
  | { kind: "soft_reuse" }
  | { kind: "hard_reuse" }
  | { kind: "unknown" };

export type SessionRepository = {
  create: (row: NewUserSession) => Promise<void>;
  attempt_rotate: (args: AttemptRotateArgs) => Promise<AttemptRotateResult>;
  invalidate: (user_id: string, session_id: string) => Promise<void>;
};

export const SELECT_SESSION_FOR_UPDATE_SQL = `SELECT id, user_id, refresh_hmac, session_expires_at, refresh_expires_at
           FROM user_session
           WHERE refresh_hmac = $1 AND user_id = $2::uuid AND id = $3::uuid
           FOR UPDATE`;

type LockedSessionRow = {
  id: string;
  user_id: string;
  refresh_hmac: string | null;
  session_expires_at: Date;
  refresh_expires_at: Date;
};

type UsedLookupRow = {
  used_at: Date;
};

async function insert_used_token(
  client: PoolClient,
  args: {
    hmac: string;
    user_id: string;
    session_id: string;
    used_at: Date;
    expires_at: Date;
  },
): Promise<void> {
  const stamped = utc_now();
  await client.query(
    `INSERT INTO used_refresh_token (
       id, refresh_hmac, user_id, session_id, used_at, expires_at,
       created_at, updated_at, created_by, updated_by
     ) VALUES (
       $1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $7, $8::uuid, $8::uuid
     )`,
    [
      new_uuid7(args.used_at.getTime()),
      args.hmac,
      args.user_id,
      args.session_id,
      args.used_at,
      args.expires_at,
      stamped,
      SYSTEM_USER_ID,
    ],
  );
}

async function delete_session_chain(
  client: PoolClient,
  user_id: string,
  session_id: string,
): Promise<void> {
  await client.query(
    `DELETE FROM used_refresh_token
      WHERE session_id = $1::uuid AND user_id = $2::uuid`,
    [session_id, user_id],
  );
  await client.query(
    `DELETE FROM user_session WHERE id = $1::uuid AND user_id = $2::uuid`,
    [session_id, user_id],
  );
}

function within_grace(used_at: Date, now: Date, grace_seconds: number): boolean {
  return now.getTime() - used_at.getTime() <= grace_seconds * 1000;
}

export function make_session_repository(pool: Pool): SessionRepository {
  return {
    async create(row) {
      const stamped = utc_now();
      await pool.query(
        `INSERT INTO user_session (
           id, user_id, refresh_hmac, session_expires_at, refresh_expires_at,
           ip_address, user_agent, created_at, updated_at, created_by, updated_by
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $8, $9::uuid, $9::uuid
         )`,
        [
          row.id,
          row.user_id,
          row.refresh_hmac,
          row.session_expires_at,
          row.refresh_expires_at,
          row.ip_address,
          row.user_agent,
          stamped,
          SYSTEM_USER_ID,
        ],
      );
    },
    async attempt_rotate(args) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<LockedSessionRow>(
          SELECT_SESSION_FOR_UPDATE_SQL,
          [args.old_hmac, args.user_id, args.session_id],
        );
        const row = locked.rows[0];
        if (row != null) {
          if (
            args.now.getTime() >= row.session_expires_at.getTime() ||
            args.now.getTime() >= row.refresh_expires_at.getTime()
          ) {
            await client.query("COMMIT");
            return { kind: "expired" };
          }
          const times = rotate_session_times({
            now: args.now,
            session_expires_at: row.session_expires_at,
            refresh_ttl_seconds: args.refresh_ttl_seconds,
          });
          const stamped = utc_now();
          await insert_used_token(client, {
            hmac: args.old_hmac,
            user_id: args.user_id,
            session_id: args.session_id,
            used_at: args.now,
            expires_at: new Date(
              args.now.getTime() + args.reuse_window_seconds * 1000,
            ),
          });
          await client.query(
            `UPDATE user_session
                SET refresh_hmac = $1,
                    refresh_expires_at = $2,
                    ip_address = $3,
                    user_agent = $4,
                    updated_at = $5,
                    updated_by = $6::uuid
              WHERE id = $7::uuid AND user_id = $8::uuid`,
            [
              args.new_hmac,
              times.refresh_expires_at,
              args.ip_address,
              args.user_agent,
              stamped,
              SYSTEM_USER_ID,
              args.session_id,
              args.user_id,
            ],
          );
          await client.query("COMMIT");
          return {
            kind: "rotated",
            refresh_expires_at: times.refresh_expires_at,
            session_expires_at: row.session_expires_at,
          };
        }
        const used = await client.query<UsedLookupRow>(
          `SELECT used_at FROM used_refresh_token
            WHERE refresh_hmac = $1 AND user_id = $2::uuid AND session_id = $3::uuid`,
          [args.old_hmac, args.user_id, args.session_id],
        );
        const used_row = used.rows[0];
        if (used_row == null) {
          await client.query("COMMIT");
          return { kind: "unknown" };
        }
        if (within_grace(used_row.used_at, args.now, args.reuse_grace_seconds)) {
          await client.query("COMMIT");
          return { kind: "soft_reuse" };
        }
        await delete_session_chain(client, args.user_id, args.session_id);
        await client.query("COMMIT");
        return { kind: "hard_reuse" };
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
    async invalidate(user_id, session_id) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await delete_session_chain(client, user_id, session_id);
        await client.query("COMMIT");
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

export function memory_sessions(): SessionRepository & {
  rows: NewUserSession[];
  used: UsedRefreshRow[];
} {
  const rows: NewUserSession[] = [];
  const used: UsedRefreshRow[] = [];
  return {
    rows,
    used,
    async create(row) {
      rows.push({ ...row });
    },
    async attempt_rotate(args) {
      const index = rows.findIndex(
        (row) =>
          row.refresh_hmac === args.old_hmac &&
          row.user_id === args.user_id &&
          row.id === args.session_id,
      );
      if (index >= 0) {
        const row = rows[index]!;
        if (
          args.now.getTime() >= row.session_expires_at.getTime() ||
          args.now.getTime() >= row.refresh_expires_at.getTime()
        ) {
          return { kind: "expired" };
        }
        const times = rotate_session_times({
          now: args.now,
          session_expires_at: row.session_expires_at,
          refresh_ttl_seconds: args.refresh_ttl_seconds,
        });
        used.push({
          refresh_hmac: args.old_hmac,
          user_id: args.user_id,
          session_id: args.session_id,
          used_at: args.now,
          expires_at: new Date(
            args.now.getTime() + args.reuse_window_seconds * 1000,
          ),
        });
        rows[index] = {
          ...row,
          refresh_hmac: args.new_hmac,
          refresh_expires_at: times.refresh_expires_at,
          ip_address: args.ip_address,
          user_agent: args.user_agent,
        };
        return {
          kind: "rotated",
          refresh_expires_at: times.refresh_expires_at,
          session_expires_at: row.session_expires_at,
        };
      }
      const used_row = used.find(
        (row) =>
          row.refresh_hmac === args.old_hmac &&
          row.user_id === args.user_id &&
          row.session_id === args.session_id,
      );
      if (used_row == null) {
        return { kind: "unknown" };
      }
      if (within_grace(used_row.used_at, args.now, args.reuse_grace_seconds)) {
        return { kind: "soft_reuse" };
      }
      await this.invalidate(args.user_id, args.session_id);
      return { kind: "hard_reuse" };
    },
    async invalidate(user_id, session_id) {
      for (let i = used.length - 1; i >= 0; i -= 1) {
        const row = used[i];
        if (row != null && row.session_id === session_id && row.user_id === user_id) {
          used.splice(i, 1);
        }
      }
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (row != null && row.id === session_id && row.user_id === user_id) {
          rows.splice(i, 1);
        }
      }
    },
  };
}
