import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool } from "pg";

import { make_login_settings_cache } from "../src/system_config.js";

function stub_pool(row: Record<string, unknown> | null): Pool {
  return {
    query: async () => ({ rows: row == null ? [] : [row] }),
  } as unknown as Pool;
}

function config_row(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    login_process_time_minimum: 300,
    login_process_time_maximum: 500,
    login_hash_concurrency_limit: 4,
    login_maximum_failed_count: 5,
    system_config_cache_ttl_seconds: 900,
    login_rate_limit_per_user_threshold: 10,
    login_rate_limit_per_user_sample_period: 300,
    login_rate_limit_per_ip_threshold: 10,
    login_rate_limit_per_ip_sample_period: 300,
    login_rate_limit_l1_delay: 500,
    login_rate_limit_l2_delay: 2000,
    login_rate_limit_lockout_seconds: 900,
    login_rate_limit_max_kib: 16384,
    password_expiry_days: 90,
    password_grace_days: 14,
    password_minimum_chars: 12,
    password_maximum_chars: 128,
    password_acceptable_crack_time_days: 1000,
    password_guess_per_second: 10000,
    password_estimate_drift_factor: 1.1,
    session_refresh_reuse_grace_seconds: 15,
    session_refresh_reuse_window_seconds: 86400,
    session_refresh_process_time_minimum: 300,
    session_refresh_process_time_maximum: 500,
    session_access_ttl_seconds: 900,
    session_refresh_ttl_seconds: 604800,
    session_total_ttl_seconds: 2592000,
    session_max_refresh_retries: 5,
    session_refresh_cleanup_seconds: 14400,
    ...overrides,
  };
}

describe("session knobs on auth cache load", () => {
  it("loads when session abort knobs are in range", async () => {
    const cache = make_login_settings_cache(stub_pool(config_row()));
    const settings = await cache.get();
    assert.equal(settings.process_time_minimum_ms, 300);
    assert.equal(settings.process_time_maximum_ms, 500);
    assert.equal(settings.session_access_ttl_seconds, 900);
    assert.equal(settings.session_refresh_ttl_seconds, 604800);
    assert.equal(settings.session_total_ttl_seconds, 2592000);
    assert.equal(settings.session_max_refresh_retries, 5);
    assert.equal(settings.session_refresh_cleanup_seconds, 14400);
    assert.equal(settings.session_refresh_reuse_grace_seconds, 15);
    assert.equal(settings.session_refresh_reuse_window_seconds, 86400);
    assert.equal(settings.session_refresh_process_time_minimum, 300);
    assert.equal(settings.session_refresh_process_time_maximum, 500);
  });

  it("does not clamp session issuance TTLs", async () => {
    const cache = make_login_settings_cache(
      stub_pool(
        config_row({
          session_access_ttl_seconds: 61,
          session_refresh_ttl_seconds: 301,
          session_total_ttl_seconds: 400,
        }),
      ),
    );
    const settings = await cache.get();
    assert.equal(settings.session_access_ttl_seconds, 61);
    assert.equal(settings.session_refresh_ttl_seconds, 301);
    assert.equal(settings.session_total_ttl_seconds, 400);
  });

  it("aborts when a session issuance TTL is unusable", async () => {
    const cache = make_login_settings_cache(
      stub_pool(config_row({ session_access_ttl_seconds: 0 })),
    );
    await assert.rejects(cache.get(), /session_access_ttl_seconds is unusable/);
  });

  it("aborts when grace is out of range", async () => {
    const cache = make_login_settings_cache(
      stub_pool(config_row({ session_refresh_reuse_grace_seconds: 4 })),
    );
    await assert.rejects(cache.get(), /session_refresh_reuse_grace_seconds is out of range/);
  });

  it("aborts when process-time minimum is out of range", async () => {
    const cache = make_login_settings_cache(
      stub_pool(config_row({ session_refresh_process_time_minimum: 99 })),
    );
    await assert.rejects(
      cache.get(),
      /session_refresh_process_time_minimum is out of range/,
    );
  });

  it("aborts when process-time maximum is out of range", async () => {
    const cache = make_login_settings_cache(
      stub_pool(config_row({ session_refresh_process_time_maximum: 1001 })),
    );
    await assert.rejects(
      cache.get(),
      /session_refresh_process_time_maximum is out of range/,
    );
  });

  it("aborts when wait min is greater than wait max", async () => {
    const cache = make_login_settings_cache(
      stub_pool(
        config_row({
          session_refresh_process_time_minimum: 400,
          session_refresh_process_time_maximum: 200,
        }),
      ),
    );
    await assert.rejects(
      cache.get(),
      /session_refresh_process_time_minimum must be <= session_refresh_process_time_maximum/,
    );
  });

  it("aborts when reuse window is not greater than grace", async () => {
    const cache = make_login_settings_cache(
      stub_pool(
        config_row({
          session_refresh_reuse_grace_seconds: 15,
          session_refresh_reuse_window_seconds: 15,
        }),
      ),
    );
    await assert.rejects(
      cache.get(),
      /session_refresh_reuse_window_seconds must be > session_refresh_reuse_grace_seconds/,
    );
  });

  it("keeps last-known-good when a later reload fails to read", async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls += 1;
        if (calls === 1) {
          return { rows: [config_row()] };
        }
        throw new Error("db down");
      },
    } as unknown as Pool;
    const cache = make_login_settings_cache(pool);
    const first = await cache.get();
    assert.equal(first.session_max_refresh_retries, 5);
    cache.invalidate();
    const second = await cache.get();
    assert.equal(second.session_access_ttl_seconds, 900);
    assert.equal(calls, 2);
  });

  it("still aborts when a successful reload fails abort-family bounds", async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls += 1;
        if (calls === 1) {
          return { rows: [config_row()] };
        }
        return { rows: [config_row({ session_refresh_reuse_grace_seconds: 4 })] };
      },
    } as unknown as Pool;
    const cache = make_login_settings_cache(pool);
    await cache.get();
    cache.invalidate();
    await assert.rejects(cache.get(), /session_refresh_reuse_grace_seconds is out of range/);
  });
});
