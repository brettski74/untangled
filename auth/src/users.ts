import type { Pool } from "pg";

import { SYSTEM_USER_ID } from "./login_settings.js";

export type LoadedUser = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  is_active: boolean;
  failed_login_count: number;
  password_expires_at: Date;
};

export type UserRepository = {
  load_by_username: (folded: string) => Promise<LoadedUser | null>;
  load_by_id: (id: string) => Promise<LoadedUser | null>;
  set_failed_login_count: (id: string, count: number) => Promise<void>;
  apply_password_change: (args: {
    id: string;
    password_hash: string;
    password_expires_at: Date;
    actor_id: string;
  }) => Promise<void>;
  roles_and_permissions: (
    id: string,
  ) => Promise<{ roles: string[]; permissions: string[] }>;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  is_active: boolean;
  failed_login_count: number;
  password_expires_at: Date;
};

function from_row(row: UserRow): LoadedUser {
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

const USER_SELECT =
  'SELECT id::text AS id, username, password_hash, display_name, is_active, failed_login_count, password_expires_at FROM "user"';

export function make_user_repository(pool: Pool): UserRepository {
  return {
    async load_by_username(folded) {
      const result = await pool.query<UserRow>(
        `${USER_SELECT} WHERE username = $1`,
        [folded],
      );
      const row = result.rows[0];
      return row == null ? null : from_row(row);
    },
    async load_by_id(id) {
      const result = await pool.query<UserRow>(
        `${USER_SELECT} WHERE id = $1::uuid`,
        [id],
      );
      const row = result.rows[0];
      return row == null ? null : from_row(row);
    },
    async set_failed_login_count(id, count) {
      await pool.query(
        'UPDATE "user" SET failed_login_count = $1, updated_at = $2, updated_by = $3::uuid WHERE id = $4::uuid',
        [count, new Date(), SYSTEM_USER_ID, id],
      );
    },
    async apply_password_change(args) {
      const now = new Date();
      await pool.query(
        'UPDATE "user" SET password_hash = $1, password_expires_at = $2, failed_login_count = 0, updated_at = $3, updated_by = $4::uuid WHERE id = $5::uuid',
        [
          args.password_hash,
          args.password_expires_at,
          now,
          args.actor_id,
          args.id,
        ],
      );
    },
    async roles_and_permissions(id) {
      const roles = await pool.query<{ name: string }>(
        `SELECT r.name AS name
         FROM user_role ur
         JOIN role r ON r.id = ur.role_id
         WHERE ur.user_id = $1::uuid
         ORDER BY r.name`,
        [id],
      );
      const permissions = await pool.query<{ key: string }>(
        `SELECT DISTINCT p.key AS key
         FROM user_role ur
         JOIN role_permission rp ON rp.role_id = ur.role_id
         JOIN permission p ON p.id = rp.permission_id
         WHERE ur.user_id = $1::uuid`,
        [id],
      );
      return {
        roles: roles.rows.map((row) => row.name),
        permissions: permissions.rows.map((row) => row.key).sort(),
      };
    },
  };
}
