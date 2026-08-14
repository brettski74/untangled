import pg from "pg";

import { verify_password } from "./passwords.js";

export type AuthenticatedUser = {
  id: string;
  username: string;
};

export type AuthenticateFn = (
  username: string,
  password: string,
) => Promise<AuthenticatedUser | null>;

export function make_authenticate(database_url: string): AuthenticateFn {
  const pool = new pg.Pool({ connectionString: database_url, max: 4 });
  return async (username, password) => {
    const folded = username.trim().toLowerCase();
    const result = await pool.query<{
      id: string;
      username: string;
      password_hash: string;
      is_active: boolean;
    }>(
      'SELECT id::text AS id, username, password_hash, is_active FROM "user" WHERE username = $1',
      [folded],
    );
    const row = result.rows[0];
    if (row == null || !row.is_active) {
      return null;
    }
    if (!(await verify_password(row.password_hash, password))) {
      return null;
    }
    return { id: row.id, username: row.username };
  };
}
