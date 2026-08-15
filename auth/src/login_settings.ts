export const SYSTEM_CONFIG_ID = "01900000-0000-7000-8000-000000000050";
/** Non-login platform principal; stamps non-human `failed_login_count` writes. */
export const SYSTEM_USER_ID = "01900000-0000-7000-8000-000000000006";

export const LOGIN_PROCESS_TIME_MINIMUM_MIN = 100;
export const LOGIN_PROCESS_TIME_MINIMUM_DEFAULT = 300;
export const LOGIN_PROCESS_TIME_MAXIMUM_MIN = 200;
export const LOGIN_PROCESS_TIME_MAXIMUM_DEFAULT = 500;
export const LOGIN_HASH_CONCURRENCY_MIN = 1;
export const LOGIN_HASH_CONCURRENCY_DEFAULT = 4;
export const LOGIN_HASH_CONCURRENCY_MAX = 10;
export const LOGIN_MAXIMUM_FAILED_COUNT_MIN = 1;
export const LOGIN_MAXIMUM_FAILED_COUNT_DEFAULT = 5;

/** Schema max_value for password_maximum_chars — not the live configured max. */
export const PASSWORD_SCHEMA_MAX_CHARS = 256;

export const INVALID_OR_OVERSIZE = "invalid-or-oversize";
export const USERNAME_EVENT_BOUND = 256;
export const ACCESS_DENIED = "Access denied";
export const SERVICE_UNAVAILABLE = "Service unavailable";

export type LoginProcessSettings = {
  process_time_minimum_ms: number;
  process_time_maximum_ms: number;
  hash_concurrency_limit: number;
  maximum_failed_count: number;
  cache_ttl_seconds: number;
};

export function clamp_login_process(raw: {
  process_time_minimum_ms: number;
  process_time_maximum_ms: number;
  hash_concurrency_limit: number;
  maximum_failed_count: number;
  cache_ttl_seconds: number;
}): LoginProcessSettings {
  const process_time_minimum_ms = Math.max(
    LOGIN_PROCESS_TIME_MINIMUM_MIN,
    raw.process_time_minimum_ms,
  );
  const process_time_maximum_ms = Math.max(
    LOGIN_PROCESS_TIME_MAXIMUM_MIN,
    raw.process_time_maximum_ms,
  );
  const hash_concurrency_limit = Math.min(
    LOGIN_HASH_CONCURRENCY_MAX,
    Math.max(LOGIN_HASH_CONCURRENCY_MIN, raw.hash_concurrency_limit),
  );
  const maximum_failed_count = Math.max(
    LOGIN_MAXIMUM_FAILED_COUNT_MIN,
    raw.maximum_failed_count,
  );
  const cache_ttl_seconds = Math.min(86400, Math.max(1, raw.cache_ttl_seconds));
  return {
    process_time_minimum_ms,
    process_time_maximum_ms,
    hash_concurrency_limit,
    maximum_failed_count,
    cache_ttl_seconds,
  };
}
