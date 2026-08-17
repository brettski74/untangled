import pg from "pg";
import { createClient } from "redis";

import { make_file_audit_sink, type AuditSink } from "./audit.js";
import { cookie_secure_from_env } from "./cookie_secure.js";
import { start_system_config_subscriber } from "./coherence.js";
import { password_expiry_evaluator, type ExpiryEvaluator } from "./expiry.js";
import { make_hash_slot_limiter, type HashSlotLimiter } from "./hash_slots.js";
import { load_private_key, load_public_key } from "./keys.js";
import {
  LOGIN_HASH_CONCURRENCY_DEFAULT,
  type LoginProcessSettings,
} from "./login_settings.js";
import { draw_process_time_ms, sleep_ms } from "./padding.js";
import { make_dummy_hash, verify_password } from "./passwords.js";
import type { RateLimitEvaluator } from "./rate_limit.js";
import { make_redis_rate_limit } from "./rate_limit_redis.js";
import { redact_redis_url, redis_url_from_env } from "./redis_url.js";
import { make_login_settings_cache, type LoginSettingsSource } from "./system_config.js";
import { make_user_repository, type UserRepository } from "./users.js";

export type AuthConfig = {
  public_origin: string;
  cookie_secure: boolean;
  private_key: CryptoKey;
  public_key: CryptoKey;
  access_token_ttl_seconds: number;
  get_settings: () => Promise<LoginProcessSettings>;
  hash_slots: HashSlotLimiter;
  rate_limit: RateLimitEvaluator;
  expiry: ExpiryEvaluator;
  users: UserRepository;
  verify_password: (hash: string, password: string) => Promise<boolean>;
  dummy_hash: string;
  audit: AuditSink;
  draw_t: (min: number, max: number) => number;
  now_ms: () => number;
  sleep: (ms: number) => Promise<void>;
};

function require_exact_origin(raw: string, label: string): string {
  const public_origin = raw.trim();
  if (public_origin === "") {
    throw new Error(
      `${label} is required (exact origin, e.g. https://localhost:8443)`,
    );
  }
  try {
    const parsed = new URL(public_origin);
    if (parsed.origin !== public_origin) {
      throw new Error("not an exact origin");
    }
  } catch {
    throw new Error(
      `${label} must be an exact origin (scheme + host + port); got ${JSON.stringify(raw)}`,
    );
  }
  return public_origin;
}

function access_token_ttl_seconds(
  raw: string | undefined = process.env.UNTANGLED_ACCESS_TOKEN_TTL_SECONDS,
): number {
  if (raw == null || raw.trim() === "") {
    return 15 * 60;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `UNTANGLED_ACCESS_TOKEN_TTL_SECONDS must be a positive integer; got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function require_database_url(env: NodeJS.ProcessEnv): string {
  const url = env.DATABASE_URL?.trim() ?? "";
  if (url === "") {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

function audit_log_dir(env: NodeJS.ProcessEnv): string {
  const dir = env.UNTANGLED_AUDIT_LOG_DIR?.trim() ?? "";
  if (dir !== "") {
    return dir;
  }
  return "/var/log/untangled/audit";
}

function audit_rollover_bytes(env: NodeJS.ProcessEnv): number {
  const raw = env.UNTANGLED_AUDIT_ROLLOVER_BYTES?.trim() ?? "";
  if (raw === "") {
    return 1_048_576;
  }
  return Number(raw);
}

function audit_rollover_seconds(env: NodeJS.ProcessEnv): number {
  const raw = env.UNTANGLED_AUDIT_ROLLOVER_SECONDS?.trim() ?? "";
  if (raw === "") {
    return 86_400;
  }
  return Number(raw);
}

export async function load_config_from_env(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthConfig> {
  const public_origin = require_exact_origin(
    env.UNTANGLED_PUBLIC_ORIGIN ?? "",
    "UNTANGLED_PUBLIC_ORIGIN",
  );
  const [private_key, public_key, dummy_hash] = await Promise.all([
    load_private_key(env),
    load_public_key(env),
    make_dummy_hash(),
  ]);
  const pool = new pg.Pool({
    connectionString: require_database_url(env),
    max: 4,
  });
  const settings_source: LoginSettingsSource = make_login_settings_cache(pool);
  const live_hash_limit = { value: LOGIN_HASH_CONCURRENCY_DEFAULT };
  const get_settings = async (): Promise<LoginProcessSettings> => {
    const settings = await settings_source.get();
    live_hash_limit.value = settings.hash_concurrency_limit;
    return settings;
  };
  await get_settings();
  const audit = make_file_audit_sink(audit_log_dir(env), {
    rollover_bytes: audit_rollover_bytes(env),
    rollover_seconds: audit_rollover_seconds(env),
  });
  const redis_url = redis_url_from_env(env.UNTANGLED_REDIS_URL);
  const redis = createClient({ url: redis_url });
  redis.on("error", (error: Error) => {
    process.stderr.write(
      `untangled-auth redis error (${redact_redis_url(redis_url)}): ${error.message}\n`,
    );
  });
  try {
    await redis.connect();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(
      `Redis unreachable for auth rate-limit (${redact_redis_url(redis_url)}): ${message}`,
      { cause: error },
    );
  }
  await start_system_config_subscriber({
    redis_url,
    cache: settings_source,
  });
  return {
    public_origin,
    cookie_secure: cookie_secure_from_env(env.UNTANGLED_COOKIE_SECURE),
    private_key,
    public_key,
    access_token_ttl_seconds: access_token_ttl_seconds(
      env.UNTANGLED_ACCESS_TOKEN_TTL_SECONDS,
    ),
    get_settings,
    hash_slots: make_hash_slot_limiter(() => live_hash_limit.value),
    rate_limit: make_redis_rate_limit({
      client: redis,
      get_settings: async () => (await get_settings()).rate_limit,
      audit,
      redis_url,
    }),
    expiry: password_expiry_evaluator(),
    users: make_user_repository(pool),
    verify_password,
    dummy_hash,
    audit,
    draw_t: draw_process_time_ms,
    now_ms: () => performance.now(),
    sleep: sleep_ms,
  };
}

export { cookie_secure_from_env };
