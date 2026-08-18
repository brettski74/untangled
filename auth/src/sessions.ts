import type { Pool } from "pg";

import { utc_now } from "./datetime_utc.js";
import { SYSTEM_USER_ID } from "./login_settings.js";

export type NewUserSession = {
  id: string;
  user_id: string;
  refresh_hmac: string | null;
  session_expires_at: Date;
  refresh_expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
};

export type SessionRepository = {
  create: (row: NewUserSession) => Promise<void>;
};

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
  };
}

export function memory_sessions(): SessionRepository & { rows: NewUserSession[] } {
  const rows: NewUserSession[] = [];
  return {
    rows,
    async create(row) {
      rows.push({ ...row });
    },
  };
}
