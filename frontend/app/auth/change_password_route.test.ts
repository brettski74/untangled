import { beforeEach, describe, expect, it, vi } from "vitest";

import { reset_session_storage_for_tests } from "./session.server";
import { fake_access_token } from "./test_tokens";

const fetch_me = vi.fn();
const change_password = vi.fn();
const fetch_record = vi.fn();

vi.mock("./api.server", async () => {
  const actual = await vi.importActual<typeof import("./api.server")>(
    "./api.server",
  );
  return {
    ...actual,
    fetch_me: (...args: unknown[]) => fetch_me(...args),
    change_password: (...args: unknown[]) => change_password(...args),
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
};

describe("change-password route (#173)", () => {
  beforeEach(() => {
    reset_session_storage_for_tests();
    process.env.UNTANGLED_SESSION_SECRET = "test-session-secret-32chars!!";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    fetch_me.mockReset();
    change_password.mockReset();
    fetch_record.mockReset();
    fetch_me.mockResolvedValue({
      username: "ada",
      display_name: "Ada Lovelace",
      roles: [],
      permissions: [],
    });
    fetch_record.mockResolvedValue(POLICY_RECORD);
  });

  it("loader returns password policy from system_config", async () => {
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
      "system-configs",
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

  it("action returns success and generic failure without inventing reasons", async () => {
    const { action } = await import("../routes/change_password");
    const cookie = await session_cookie();

    change_password.mockResolvedValueOnce({
      ok: true,
      detail: "Password change complete.",
    });
    const ok = await action({
      request: new Request("http://web.test/change-password", {
        method: "POST",
        headers: { Cookie: cookie },
        body: new URLSearchParams({
          current_password: "old",
          new_password: "new-password-ok",
          verify_new_password: "new-password-ok",
        }),
      }),
      params: {},
      context: {},
    } as never);
    expect(ok.data).toEqual({
      ok: true,
      detail: "Password change complete.",
    });

    change_password.mockResolvedValueOnce({
      ok: false,
      detail: "Password change failed.",
    });
    const failed = await action({
      request: new Request("http://web.test/change-password", {
        method: "POST",
        headers: { Cookie: cookie },
        body: new URLSearchParams({
          current_password: "wrong",
          new_password: "new-password-ok",
          verify_new_password: "new-password-ok",
        }),
      }),
      params: {},
      context: {},
    } as never);
    expect(failed.data).toEqual({
      ok: false,
      detail: "Password change failed.",
    });
  });
});
