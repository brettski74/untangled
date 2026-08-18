import { beforeEach, describe, expect, it, vi } from "vitest";

import { reset_access_verifier_for_tests } from "./session.server";
import { invalidate_system_config_cache } from "./system_config_cache.server";
import { fake_access_token, install_test_jwt_keys } from "./test_tokens";

const fetch_me = vi.fn();
const fetch_record = vi.fn();

vi.mock("./api.server", async () => {
  const actual = await vi.importActual<typeof import("./api.server")>(
    "./api.server",
  );
  return {
    ...actual,
    fetch_me: (...args: unknown[]) => fetch_me(...args),
  };
});

vi.mock("../records/fetch.server", () => ({
  fetch_record: (...args: unknown[]) => fetch_record(...args),
}));

async function session_cookie(token = fake_access_token()): Promise<string> {
  const { commit_access_token } = await import("./session.server");
  const set_cookie = await commit_access_token(
    new Request("http://web.test/"),
    token,
  );
  return set_cookie.split(";")[0] ?? set_cookie;
}

const POLICY_RECORD = {
  id: "01900000-0000-7000-8000-000000000050",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: "01900000-0000-7000-8000-000000000006",
  updated_by: "01900000-0000-7000-8000-000000000006",
  max_search_nesting_depth: 3,
  max_search_nesting_length: 10,
  max_search_total_predicates: 50,
  max_search_total_regexp: 5,
  system_config_cache_ttl_seconds: 900,
  password_minimum_chars: 12,
  password_maximum_chars: 128,
  password_acceptable_crack_time_days: 1000,
  password_guess_per_second: 10000,
  password_estimate_drift_factor: "1.1",
  password_expiry_days: 90,
  password_grace_days: 14,
  login_process_time_minimum: 300,
  login_process_time_maximum: 500,
  login_hash_concurrency_limit: 4,
  login_maximum_failed_count: 5,
  login_rate_limit_per_user_threshold: 10,
  login_rate_limit_per_user_sample_period: 300,
  login_rate_limit_per_ip_threshold: 10,
  login_rate_limit_per_ip_sample_period: 300,
  login_rate_limit_l1_delay: 500,
  login_rate_limit_l2_delay: 2000,
  login_rate_limit_lockout_seconds: 900,
  login_rate_limit_max_kib: 16384,
  audit_bulk_read_window_seconds: 600,
  audit_bulk_read_max_searches: 100,
  session_access_ttl_seconds: 900,
  session_refresh_ttl_seconds: 604800,
  session_total_ttl_seconds: 2592000,
  session_refresh_reuse_grace_seconds: 15,
  session_refresh_reuse_window_seconds: 86400,
  session_max_refresh_retries: 5,
  session_refresh_cleanup_seconds: 14400,
  session_refresh_process_time_minimum: 300,
  session_refresh_process_time_maximum: 500,
};

describe("change-password route (#173/#215)", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    invalidate_system_config_cache();
    fetch_me.mockReset();
    fetch_record.mockReset();
    fetch_me.mockResolvedValue({
      username: "ada",
      display_name: "Ada Lovelace",
      roles: [],
      permissions: [],
    });
    fetch_record.mockResolvedValue(POLICY_RECORD);
  });

  it("loader returns password policy from cached system_config", async () => {
    const { loader } = await import("../routes/change_password");
    const cookie = await session_cookie();
    const response = await loader({
      request: new Request("http://web.test/change-password", {
        headers: { Cookie: cookie },
      }),
      params: {},
      context: {},
    } as never);

    const body = await response.data;
    expect(body.username).toBe("ada");
    expect(body.policy.password_minimum_chars).toBe(12);
    expect(body.policy.password_estimate_drift_factor).toBe(1.1);
    expect(fetch_record).toHaveBeenCalledWith(
      expect.any(String),
      "system_config",
      POLICY_RECORD.id,
    );
  });

  it("loader fails closed when policy fields are missing", async () => {
    fetch_record.mockResolvedValue({
      id: POLICY_RECORD.id,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      created_by: POLICY_RECORD.created_by,
      updated_by: POLICY_RECORD.updated_by,
    });
    const { loader } = await import("../routes/change_password");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/change-password", {
          headers: { Cookie: cookie },
        }),
        params: {},
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 503 });
  });
});
