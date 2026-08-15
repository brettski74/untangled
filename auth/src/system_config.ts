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
};

export function make_login_settings_cache(pool: Pool): LoginSettingsSource {
  let entry: CacheEntry | null = null;
  return {
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
      }>(
        `SELECT login_process_time_minimum, login_process_time_maximum,
                login_hash_concurrency_limit, login_maximum_failed_count,
                system_config_cache_ttl_seconds
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
    async get() {
      return settings;
    },
  };
}
