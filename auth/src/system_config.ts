import type { Pool } from "pg";

import {
  SYSTEM_CONFIG_ID,
  clamp_login_process,
  type LoginProcessSettings,
} from "./login_settings.js";
import {
  SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MAX,
  SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MIN,
  SESSION_REFRESH_PROCESS_TIME_MINIMUM_MAX,
  SESSION_REFRESH_PROCESS_TIME_MINIMUM_MIN,
  SESSION_REFRESH_REUSE_GRACE_MAX,
  SESSION_REFRESH_REUSE_GRACE_MIN,
  type SessionIssueSettings,
} from "./session_settings.js";

export type AuthRuntimeSettings = LoginProcessSettings & SessionIssueSettings;

/** Failed reload backoff so a persistent fault does not storm the database. */
export const SETTINGS_RELOAD_BACKOFF_MS = 30_000;

export class SessionSettingsAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionSettingsAbortError";
  }
}

type CacheEntry = {
  value: AuthRuntimeSettings;
  expires_at: number;
};

export type LoginSettingsSource = {
  get: () => Promise<AuthRuntimeSettings>;
  invalidate: () => void;
};

function require_positive_int(value: unknown, name: string): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(n) || n < 1) {
    throw new SessionSettingsAbortError(`${name} is unusable; auth abort`);
  }
  return n;
}

function settings_from_row(row: {
  login_process_time_minimum: number;
  login_process_time_maximum: number;
  login_hash_concurrency_limit: number;
  login_maximum_failed_count: number;
  system_config_cache_ttl_seconds: number;
  login_rate_limit_per_user_threshold: number;
  login_rate_limit_per_user_sample_period: number;
  login_rate_limit_per_ip_threshold: number;
  login_rate_limit_per_ip_sample_period: number;
  login_rate_limit_l1_delay: number;
  login_rate_limit_l2_delay: number;
  login_rate_limit_lockout_seconds: number;
  login_rate_limit_max_kib: number;
  password_expiry_days: number;
  password_grace_days: number;
  password_minimum_chars: number;
  password_maximum_chars: number;
  password_acceptable_crack_time_days: number;
  password_guess_per_second: number;
  password_estimate_drift_factor: string | number;
  session_refresh_reuse_grace_seconds: number;
  session_refresh_reuse_window_seconds: number;
  session_refresh_process_time_minimum: number;
  session_refresh_process_time_maximum: number;
  session_access_ttl_seconds: unknown;
  session_refresh_ttl_seconds: unknown;
  session_total_ttl_seconds: unknown;
  session_max_refresh_retries: unknown;
  session_refresh_cleanup_seconds: unknown;
}): AuthRuntimeSettings {
  const grace = row.session_refresh_reuse_grace_seconds;
  const window_seconds = row.session_refresh_reuse_window_seconds;
  const process_min = row.session_refresh_process_time_minimum;
  const process_max = row.session_refresh_process_time_maximum;
  if (
    grace < SESSION_REFRESH_REUSE_GRACE_MIN ||
    grace > SESSION_REFRESH_REUSE_GRACE_MAX
  ) {
    throw new SessionSettingsAbortError(
      `session_refresh_reuse_grace_seconds is out of range (${grace}); auth abort`,
    );
  }
  if (
    process_min < SESSION_REFRESH_PROCESS_TIME_MINIMUM_MIN ||
    process_min > SESSION_REFRESH_PROCESS_TIME_MINIMUM_MAX
  ) {
    throw new SessionSettingsAbortError(
      `session_refresh_process_time_minimum is out of range (${process_min}); auth abort`,
    );
  }
  if (
    process_max < SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MIN ||
    process_max > SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MAX
  ) {
    throw new SessionSettingsAbortError(
      `session_refresh_process_time_maximum is out of range (${process_max}); auth abort`,
    );
  }
  if (process_min > process_max) {
    throw new SessionSettingsAbortError(
      "session_refresh_process_time_minimum must be <= session_refresh_process_time_maximum; auth abort",
    );
  }
  if (window_seconds <= grace) {
    throw new SessionSettingsAbortError(
      "session_refresh_reuse_window_seconds must be > session_refresh_reuse_grace_seconds; auth abort",
    );
  }
  const session_access_ttl_seconds = require_positive_int(
    row.session_access_ttl_seconds,
    "session_access_ttl_seconds",
  );
  const session_refresh_ttl_seconds = require_positive_int(
    row.session_refresh_ttl_seconds,
    "session_refresh_ttl_seconds",
  );
  const session_total_ttl_seconds = require_positive_int(
    row.session_total_ttl_seconds,
    "session_total_ttl_seconds",
  );
  const session_max_refresh_retries = require_positive_int(
    row.session_max_refresh_retries,
    "session_max_refresh_retries",
  );
  const session_refresh_cleanup_seconds = require_positive_int(
    row.session_refresh_cleanup_seconds,
    "session_refresh_cleanup_seconds",
  );
  const login = clamp_login_process({
    process_time_minimum_ms: row.login_process_time_minimum,
    process_time_maximum_ms: row.login_process_time_maximum,
    hash_concurrency_limit: row.login_hash_concurrency_limit,
    maximum_failed_count: row.login_maximum_failed_count,
    cache_ttl_seconds: row.system_config_cache_ttl_seconds,
    password_expiry_days: row.password_expiry_days,
    password_grace_days: row.password_grace_days,
    password_minimum_chars: row.password_minimum_chars,
    password_maximum_chars: row.password_maximum_chars,
    password_acceptable_crack_time_days:
      row.password_acceptable_crack_time_days,
    password_guess_per_second: row.password_guess_per_second,
    password_estimate_drift_factor: Number(row.password_estimate_drift_factor),
    rate_limit: {
      per_user_threshold: row.login_rate_limit_per_user_threshold,
      per_user_sample_period_s: row.login_rate_limit_per_user_sample_period,
      per_ip_threshold: row.login_rate_limit_per_ip_threshold,
      per_ip_sample_period_s: row.login_rate_limit_per_ip_sample_period,
      l1_delay_ms: row.login_rate_limit_l1_delay,
      l2_delay_ms: row.login_rate_limit_l2_delay,
      lockout_s: row.login_rate_limit_lockout_seconds,
      max_kib: row.login_rate_limit_max_kib,
    },
  });
  if (login.process_time_minimum_ms > login.process_time_maximum_ms) {
    throw new Error("login_process_time_minimum must be <= login_process_time_maximum");
  }
  return {
    ...login,
    session_access_ttl_seconds,
    session_refresh_ttl_seconds,
    session_total_ttl_seconds,
    session_refresh_reuse_grace_seconds: grace,
    session_refresh_reuse_window_seconds: window_seconds,
    session_max_refresh_retries,
    session_refresh_cleanup_seconds,
    session_refresh_process_time_minimum: process_min,
    session_refresh_process_time_maximum: process_max,
  };
}

export function make_login_settings_cache(pool: Pool): LoginSettingsSource {
  let entry: CacheEntry | null = null;
  return {
    invalidate() {
      if (entry == null) {
        return;
      }
      entry = { value: entry.value, expires_at: 0 };
    },
    async get() {
      const now = Date.now();
      if (entry != null && now < entry.expires_at) {
        return entry.value;
      }
      const previous = entry;
      try {
        const result = await pool.query<{
          login_process_time_minimum: number;
          login_process_time_maximum: number;
          login_hash_concurrency_limit: number;
          login_maximum_failed_count: number;
          system_config_cache_ttl_seconds: number;
          login_rate_limit_per_user_threshold: number;
          login_rate_limit_per_user_sample_period: number;
          login_rate_limit_per_ip_threshold: number;
          login_rate_limit_per_ip_sample_period: number;
          login_rate_limit_l1_delay: number;
          login_rate_limit_l2_delay: number;
          login_rate_limit_lockout_seconds: number;
          login_rate_limit_max_kib: number;
          password_expiry_days: number;
          password_grace_days: number;
          password_minimum_chars: number;
          password_maximum_chars: number;
          password_acceptable_crack_time_days: number;
          password_guess_per_second: number;
          password_estimate_drift_factor: string | number;
          session_refresh_reuse_grace_seconds: number;
          session_refresh_reuse_window_seconds: number;
          session_refresh_process_time_minimum: number;
          session_refresh_process_time_maximum: number;
          session_access_ttl_seconds: unknown;
          session_refresh_ttl_seconds: unknown;
          session_total_ttl_seconds: unknown;
          session_max_refresh_retries: unknown;
          session_refresh_cleanup_seconds: unknown;
        }>(
          `SELECT login_process_time_minimum, login_process_time_maximum,
                  login_hash_concurrency_limit, login_maximum_failed_count,
                  system_config_cache_ttl_seconds,
                  login_rate_limit_per_user_threshold,
                  login_rate_limit_per_user_sample_period,
                  login_rate_limit_per_ip_threshold,
                  login_rate_limit_per_ip_sample_period,
                  login_rate_limit_l1_delay, login_rate_limit_l2_delay,
                  login_rate_limit_lockout_seconds, login_rate_limit_max_kib,
                  password_expiry_days, password_grace_days,
                  password_minimum_chars, password_maximum_chars,
                  password_acceptable_crack_time_days,
                  password_guess_per_second, password_estimate_drift_factor,
                  session_refresh_reuse_grace_seconds,
                  session_refresh_reuse_window_seconds,
                  session_refresh_process_time_minimum,
                  session_refresh_process_time_maximum,
                  session_access_ttl_seconds,
                  session_refresh_ttl_seconds,
                  session_total_ttl_seconds,
                  session_max_refresh_retries,
                  session_refresh_cleanup_seconds
           FROM system_config WHERE id = $1::uuid`,
          [SYSTEM_CONFIG_ID],
        );
        const row = result.rows[0];
        if (row == null) {
          throw new Error("system-config singleton could not be read");
        }
        const value = settings_from_row(row);
        entry = {
          value,
          expires_at: now + value.cache_ttl_seconds * 1000,
        };
        return value;
      } catch (error: unknown) {
        if (error instanceof SessionSettingsAbortError || previous == null) {
          throw error;
        }
        entry = {
          value: previous.value,
          expires_at: now + SETTINGS_RELOAD_BACKOFF_MS,
        };
        return previous.value;
      }
    },
  };
}

export function static_login_settings(
  settings: AuthRuntimeSettings,
): LoginSettingsSource {
  return {
    invalidate() {},
    async get() {
      return settings;
    },
  };
}
