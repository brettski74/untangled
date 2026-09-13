import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/** Must match ``untangled.rbac.store.MAX_ROLE_GRAPH_DEPTH``. */
export const MAX_ROLE_GRAPH_DEPTH = 16;

/** Must match ``untangled.mapping.well_known.AUTHZ_VERSION_ID``. */
export const AUTHZ_VERSION_ID = "01900000-0000-7000-8000-000000000051";

export const AUTHZ_USER_KEY_PREFIX = "untangled.authz.user:";
export const AUTHZ_CACHE_TTL_SECONDS = 60;

const __dirname = dirname(fileURLToPath(import.meta.url));

let _sql: string | null = null;

export function effective_permissions_sql(): string {
  if (_sql == null) {
    const raw = readFileSync(
      join(__dirname, "effective_permissions.sql"),
      "utf8",
    );
    _sql = raw.replaceAll("__P1__", "$1").replaceAll("__P2__", "$2");
  }
  return _sql;
}

export function authz_user_redis_key(user_id: string): string {
  return `${AUTHZ_USER_KEY_PREFIX}${user_id}`;
}

export class RoleGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleGraphError";
  }
}

type FlattenRow = {
  has_cycle: boolean;
  depth_exceeded: boolean;
  key: string | null;
};

/** Minimal Redis command surface used by the authz cache. */
export type AuthzRedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    options: { EX: number },
  ) => Promise<unknown>;
};

export async function fetch_global_authz_version(pool: Pool): Promise<number> {
  const result = await pool.query<{ version: string | number }>(
    "SELECT version FROM authz_version WHERE id = $1::uuid",
    [AUTHZ_VERSION_ID],
  );
  const row = result.rows[0];
  if (row == null) {
    throw new Error("authz_version singleton row is missing");
  }
  return Number(row.version);
}

export async function fetch_effective_permission_keys(
  pool: Pool,
  user_id: string,
): Promise<string[]> {
  const result = await pool.query<FlattenRow>(effective_permissions_sql(), [
    user_id,
    MAX_ROLE_GRAPH_DEPTH,
  ]);
  if (result.rows.some((row) => row.has_cycle)) {
    throw new RoleGraphError(
      `role graph cycle detected while resolving permissions for user ${user_id}`,
    );
  }
  if (result.rows.some((row) => row.depth_exceeded)) {
    throw new RoleGraphError(
      `role graph exceeds max depth ${MAX_ROLE_GRAPH_DEPTH} while resolving permissions for user ${user_id}`,
    );
  }
  const keys = new Set<string>();
  for (const row of result.rows) {
    if (row.key != null) {
      keys.add(row.key);
    }
  }
  return [...keys].sort();
}

type CachePayload = { v: number; keys: string[] };

export async function fetch_effective_permission_keys_cached(
  pool: Pool,
  user_id: string,
  redis: AuthzRedisClient | null,
): Promise<string[]> {
  const global_version = await fetch_global_authz_version(pool);
  const key = authz_user_redis_key(user_id);

  if (redis != null) {
    try {
      const raw = await redis.get(key);
      if (raw != null) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed != null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as CachePayload).v === global_version &&
          Array.isArray((parsed as CachePayload).keys) &&
          (parsed as CachePayload).keys.every((k) => typeof k === "string")
        ) {
          return [...(parsed as CachePayload).keys].sort();
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      process.stderr.write(
        `authz cache GET failed for ${key}; falling back to database: ${message}\n`,
      );
    }
  }

  const keys = await fetch_effective_permission_keys(pool, user_id);
  if (redis != null) {
    try {
      await redis.set(
        key,
        JSON.stringify({ v: global_version, keys }),
        { EX: AUTHZ_CACHE_TTL_SECONDS },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      process.stderr.write(
        `authz cache SET failed for ${key}; continuing without cache: ${message}\n`,
      );
    }
  }
  return keys;
}
