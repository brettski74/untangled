import { generateKeyPair } from "jose";

import { memory_audit_sink, type AuditEvent, type AuditSink } from "../src/audit.js";
import type { AuthConfig } from "../src/config.js";
import { cookie_secure_from_env } from "../src/cookie_secure.js";
import { password_expiry_evaluator } from "../src/expiry.js";
import { make_hash_slot_limiter } from "../src/hash_slots.js";
import {
  LOGIN_HASH_CONCURRENCY_DEFAULT,
  LOGIN_MAXIMUM_FAILED_COUNT_DEFAULT,
  default_rate_limit_settings,
  type LoginProcessSettings,
} from "../src/login_settings.js";
import { draw_process_time_ms, sleep_ms } from "../src/padding.js";
import { stub_rate_limit } from "../src/rate_limit.js";
import { static_login_settings } from "../src/system_config.js";
import type { LoadedUser, UserRepository } from "../src/users.js";

export const PUBLIC_ORIGIN = "https://localhost:8443";
export const TEST_USER_ID = "01900000-0000-7000-8000-000000000001";
export const TEST_PASSWORD_HASH = "test-hash";
export const TEST_DUMMY_HASH = "dummy-hash";

export function test_login_settings(
  overrides: Partial<LoginProcessSettings> = {},
): LoginProcessSettings {
  return {
    process_time_minimum_ms: 0,
    process_time_maximum_ms: 0,
    hash_concurrency_limit: LOGIN_HASH_CONCURRENCY_DEFAULT,
    maximum_failed_count: LOGIN_MAXIMUM_FAILED_COUNT_DEFAULT,
    cache_ttl_seconds: 900,
    password_expiry_days: 90,
    password_grace_days: 14,
    password_minimum_chars: 12,
    password_maximum_chars: 128,
    password_acceptable_crack_time_days: 1000,
    password_guess_per_second: 10000,
    password_estimate_drift_factor: 1.1,
    rate_limit: default_rate_limit_settings(),
    ...overrides,
  };
}

export function memory_users(initial: LoadedUser[]): UserRepository & {
  rows: Map<string, LoadedUser>;
} {
  const rows = new Map(initial.map((user) => [user.username, { ...user }]));
  return {
    rows,
    async load_by_username(folded) {
      const row = rows.get(folded);
      return row == null ? null : { ...row };
    },
    async load_by_id(id) {
      for (const row of rows.values()) {
        if (row.id === id) {
          return { ...row };
        }
      }
      return null;
    },
    async set_failed_login_count(id, count) {
      for (const [key, row] of rows) {
        if (row.id === id) {
          rows.set(key, { ...row, failed_login_count: count });
        }
      }
    },
    async apply_password_change(args) {
      for (const [key, row] of rows) {
        if (row.id === args.id) {
          rows.set(key, {
            ...row,
            password_hash: args.password_hash,
            password_expires_at: args.password_expires_at,
            failed_login_count: 0,
          });
        }
      }
    },
    async roles_and_permissions() {
      return { roles: ["admin"], permissions: ["admin"] };
    },
  };
}

export const TEST_ADMIN: LoadedUser = {
  id: TEST_USER_ID,
  username: "admin",
  password_hash: TEST_PASSWORD_HASH,
  display_name: "Admin",
  is_active: true,
  failed_login_count: 0,
  password_expires_at: new Date(Date.now() + 86_400_000),
};

export async function test_config(
  overrides: {
    cookie_secure?: boolean;
    public_origin?: string;
    settings?: LoginProcessSettings;
    users?: UserRepository;
    verify_password?: AuthConfig["verify_password"];
    dummy_hash?: string;
    audit_events?: AuditEvent[];
    audit?: AuditSink;
    rate_limit?: AuthConfig["rate_limit"];
    expiry?: AuthConfig["expiry"];
    hash_slots?: AuthConfig["hash_slots"];
    draw_t?: AuthConfig["draw_t"];
    now_ms?: AuthConfig["now_ms"];
    sleep?: AuthConfig["sleep"];
  } = {},
): Promise<AuthConfig> {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const settings = overrides.settings ?? test_login_settings();
  const audit_events = overrides.audit_events ?? [];
  const users =
    overrides.users ??
    memory_users([TEST_ADMIN]);
  const verify_password: AuthConfig["verify_password"] =
    overrides.verify_password ??
    (async (password_hash, password) => {
      if (password_hash === TEST_DUMMY_HASH) {
        return false;
      }
      return password_hash === TEST_PASSWORD_HASH && password === "admin-change-me";
    });
  return {
    public_origin: overrides.public_origin ?? PUBLIC_ORIGIN,
    cookie_secure: overrides.cookie_secure ?? true,
    private_key: privateKey,
    public_key: publicKey,
    refresh_hmac_secret: Buffer.alloc(32),
    access_token_ttl_seconds: 900,
    get_settings: static_login_settings(settings).get,
    hash_slots:
      overrides.hash_slots ??
      make_hash_slot_limiter(() => settings.hash_concurrency_limit),
    rate_limit: overrides.rate_limit ?? stub_rate_limit(),
    expiry: overrides.expiry ?? password_expiry_evaluator(),
    users,
    verify_password,
    dummy_hash: overrides.dummy_hash ?? TEST_DUMMY_HASH,
    audit: overrides.audit ?? memory_audit_sink(audit_events),
    draw_t: overrides.draw_t ?? draw_process_time_ms,
    now_ms: overrides.now_ms ?? (() => performance.now()),
    sleep: overrides.sleep ?? sleep_ms,
  };
}

export { cookie_secure_from_env };
