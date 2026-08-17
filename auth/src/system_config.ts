import type { Pool } from "pg";

import {
  SYSTEM_CONFIG_ID,
  clamp_login_process,
  type LoginProcessSettings,
} from "./login_settings.js";

type CacheEntry = {
  value: LoginProcessSettings;
  expires_at: number;
};

export type LoginSettingsSource = {
  get: () => Promise<LoginProcessSettings>;
  invalidate: () => void;
};

export function make_login_settings_cache(pool: Pool): LoginSettingsSource {
  let entry: CacheEntry | null = null;
  return {
    invalidate() {
      entry = null;
    },
    async get() {
      const now = Date.now();
      if (entry != null && now < entry.expires_at) {
        return entry.value;
      }
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
                password_guess_per_second, password_estimate_drift_factor
         FROM system_config WHERE id = $1::uuid`,
        [SYSTEM_CONFIG_ID],
      );
      const row = result.rows[0];
      if (row == null) {
        throw new Error("system-config singleton could not be read");
      }
      const value = clamp_login_process({
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
      if (value.process_time_minimum_ms > value.process_time_maximum_ms) {
        throw new Error("login_process_time_minimum must be <= login_process_time_maximum");
      }
      entry = {
        value,
        expires_at: now + value.cache_ttl_seconds * 1000,
      };
      return value;
    },
  };
}

export function static_login_settings(
  settings: LoginProcessSettings,
): LoginSettingsSource {
  return {
    invalidate() {},
    async get() {
      return settings;
    },
  };
}
