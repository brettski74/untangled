import type { Pool } from "pg";

import { SYSTEM_USER_ID } from "./login_settings.js";

export type LoadedUser = {
  id: string;
  username: string;
  password_hash: string;
  is_active: boolean;
  failed_login_count: number;
};

export type UserRepository = {
  load_by_username: (folded: string) => Promise<LoadedUser | null>;
  set_failed_login_count: (id: string, count: number) => Promise<void>;
};

export function make_user_repository(pool: Pool): UserRepository {
  return {
    async load_by_username(folded) {
      const result = await pool.query<{
        id: string;
        username: string;
        password_hash: string;
        is_active: boolean;
        failed_login_count: number;
      }>(
        'SELECT id::text AS id, username, password_hash, is_active, failed_login_count FROM "user" WHERE username = $1',
        [folded],
      );
      const row = result.rows[0];
      if (row == null) {
        return null;
      }
      return {
        id: row.id,
        username: row.username,
        password_hash: row.password_hash,
        is_active: row.is_active,
        failed_login_count: row.failed_login_count,
      };
    },
    async set_failed_login_count(id, count) {
      await pool.query(
        'UPDATE "user" SET failed_login_count = $1, updated_at = $2, updated_by = $3::uuid WHERE id = $4::uuid',
        [count, new Date(), SYSTEM_USER_ID, id],
      );
    },
  };
}
