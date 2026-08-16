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

export const LOGIN_RATE_LIMIT_THRESHOLD_MIN = 1;
export const LOGIN_RATE_LIMIT_THRESHOLD_DEFAULT = 10;
export const LOGIN_RATE_LIMIT_SAMPLE_PERIOD_MIN = 1;
export const LOGIN_RATE_LIMIT_SAMPLE_PERIOD_DEFAULT = 300;
export const LOGIN_RATE_LIMIT_DELAY_MIN = 0;
export const LOGIN_RATE_LIMIT_L1_DELAY_DEFAULT = 500;
export const LOGIN_RATE_LIMIT_L2_DELAY_DEFAULT = 2000;
export const LOGIN_RATE_LIMIT_LOCKOUT_MIN = 1;
export const LOGIN_RATE_LIMIT_LOCKOUT_DEFAULT = 900;
export const LOGIN_RATE_LIMIT_MAX_KIB_MIN = 8192;
export const LOGIN_RATE_LIMIT_MAX_KIB_DEFAULT = 16384;
export const LOGIN_RATE_LIMIT_MAX_KIB_MAX = 262144;

/** Schema max_value for password_maximum_chars — not the live configured max. */
export const PASSWORD_SCHEMA_MAX_CHARS = 256;

export const INVALID_OR_OVERSIZE = "invalid-or-oversize";
export const USERNAME_EVENT_BOUND = 256;
export const ACCESS_DENIED = "Access denied";
export const SERVICE_UNAVAILABLE = "Service unavailable";

export type RateLimitSettings = {
  per_user_threshold: number;
  per_user_sample_period_s: number;
  per_ip_threshold: number;
  per_ip_sample_period_s: number;
  l1_delay_ms: number;
  l2_delay_ms: number;
  lockout_s: number;
  max_kib: number;
};

export type LoginProcessSettings = {
  process_time_minimum_ms: number;
  process_time_maximum_ms: number;
  hash_concurrency_limit: number;
  maximum_failed_count: number;
  cache_ttl_seconds: number;
  rate_limit: RateLimitSettings;
};

export function default_rate_limit_settings(): RateLimitSettings {
  return {
    per_user_threshold: LOGIN_RATE_LIMIT_THRESHOLD_DEFAULT,
    per_user_sample_period_s: LOGIN_RATE_LIMIT_SAMPLE_PERIOD_DEFAULT,
    per_ip_threshold: LOGIN_RATE_LIMIT_THRESHOLD_DEFAULT,
    per_ip_sample_period_s: LOGIN_RATE_LIMIT_SAMPLE_PERIOD_DEFAULT,
    l1_delay_ms: LOGIN_RATE_LIMIT_L1_DELAY_DEFAULT,
    l2_delay_ms: LOGIN_RATE_LIMIT_L2_DELAY_DEFAULT,
    lockout_s: LOGIN_RATE_LIMIT_LOCKOUT_DEFAULT,
    max_kib: LOGIN_RATE_LIMIT_MAX_KIB_DEFAULT,
  };
}

function clamp_min(value: number, min: number): number {
  return Math.max(min, value);
}

export function clamp_rate_limit(raw: RateLimitSettings): RateLimitSettings {
  return {
    per_user_threshold: clamp_min(
      raw.per_user_threshold,
      LOGIN_RATE_LIMIT_THRESHOLD_MIN,
    ),
    per_user_sample_period_s: clamp_min(
      raw.per_user_sample_period_s,
      LOGIN_RATE_LIMIT_SAMPLE_PERIOD_MIN,
    ),
    per_ip_threshold: clamp_min(
      raw.per_ip_threshold,
      LOGIN_RATE_LIMIT_THRESHOLD_MIN,
    ),
    per_ip_sample_period_s: clamp_min(
      raw.per_ip_sample_period_s,
      LOGIN_RATE_LIMIT_SAMPLE_PERIOD_MIN,
    ),
    l1_delay_ms: clamp_min(raw.l1_delay_ms, LOGIN_RATE_LIMIT_DELAY_MIN),
    l2_delay_ms: clamp_min(raw.l2_delay_ms, LOGIN_RATE_LIMIT_DELAY_MIN),
    lockout_s: clamp_min(raw.lockout_s, LOGIN_RATE_LIMIT_LOCKOUT_MIN),
    max_kib: Math.min(
      LOGIN_RATE_LIMIT_MAX_KIB_MAX,
      clamp_min(raw.max_kib, LOGIN_RATE_LIMIT_MAX_KIB_MIN),
    ),
  };
}

export function clamp_login_process(raw: {
  process_time_minimum_ms: number;
  process_time_maximum_ms: number;
  hash_concurrency_limit: number;
  maximum_failed_count: number;
  cache_ttl_seconds: number;
  rate_limit: RateLimitSettings;
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
    rate_limit: clamp_rate_limit(raw.rate_limit),
  };
}
