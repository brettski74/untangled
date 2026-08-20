import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { make_file_audit_sink, type AuditEvent } from "../src/audit.js";
import { ACCESS_COOKIE_NAME } from "../src/cookies.js";
import { make_hash_slot_limiter } from "../src/hash_slots.js";
import { INVALID_OR_OVERSIZE } from "../src/login_settings.js";
import { run_login_pipeline, type LoginRequestContext } from "../src/login_pipeline.js";
import { remaining_wait_ms } from "../src/padding.js";
import type { RateLimitEvaluator, RateLimitResult } from "../src/rate_limit.js";
import { create_server } from "../src/server.js";
import {
  PUBLIC_ORIGIN,
  TEST_ADMIN,
  TEST_DUMMY_HASH,
  TEST_PASSWORD_HASH,
  TEST_USER_ID,
  memory_users,
  test_config,
  test_login_settings,
} from "./helpers.js";

function ctx(overrides: Partial<LoginRequestContext> = {}): LoginRequestContext {
  return {
    provided_username: "admin",
    password: "admin-change-me",
    source_ip: "203.0.113.9",
    protocol: "https",
    host: "localhost:8443",
    context_path: "/api/v2/auth/login",
    user_agent: "untangled-test",
    ...overrides,
  };
}

function spy_rate_limit(result: RateLimitResult = { delay_ms: 0, lockout: false }): RateLimitEvaluator & {
  evaluated: { username_key: string; source_ip: string | undefined }[];
  recorded: { username_key: string; source_ip: string | undefined }[];
} {
  const evaluated: { username_key: string; source_ip: string | undefined }[] = [];
  const recorded: { username_key: string; source_ip: string | undefined }[] = [];
  return {
    evaluated,
    recorded,
    evaluate(username_key, source_ip) {
      evaluated.push({ username_key, source_ip });
      return result;
    },
    record_failure(username_key, source_ip) {
      recorded.push({ username_key, source_ip });
    },
  };
}

async function pipeline_deps(
  overrides: Parameters<typeof test_config>[0] = {},
) {
  const events: AuditEvent[] = overrides.audit_events ?? [];
  const config = await test_config({ ...overrides, audit_events: events });
  return { config, events, deps: {
    settings: await config.get_settings(),
    hash_slots: config.hash_slots,
    rate_limit: config.rate_limit,
    expiry: config.expiry,
    users: config.users,
    verify_password: config.verify_password,
    dummy_hash: config.dummy_hash,
    audit: config.audit,
    draw_t: config.draw_t,
    now_ms: config.now_ms,
    sleep: config.sleep,
  } };
}

describe("login pipeline", () => {
  it("succeeds without waiting and resets failed_login_count", async () => {
    const users = memory_users([{ ...TEST_ADMIN, failed_login_count: 2 }]);
    const slept: number[] = [];
    const { deps, events } = await pipeline_deps({
      users,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.deepEqual(result, {
      kind: "success",
      user_id: TEST_USER_ID,
      password_change_required: false,
    });
    assert.deepEqual(slept, []);
    assert.equal((await users.load_by_username("admin"))?.failed_login_count, 0);
    assert.equal(events[0]?.event_type, "auth.login");
    assert.equal(events[0]?.outcome, "success");
    assert.equal(events[0]?.reason, "login_ok");
    assert.equal(events[0]?.data.username_key, "admin");
  });

  it("grace-window expiry succeeds with password_change_required", async () => {
    const { deps } = await pipeline_deps({
      expiry: { classify: () => "must_change" },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.deepEqual(result, {
      kind: "success",
      user_id: TEST_USER_ID,
      password_change_required: true,
    });
  });

  it("past-grace expiry is denied", async () => {
    const { deps, events } = await pipeline_deps({
      expiry: { classify: () => "failure" },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.equal(result.kind, "denied");
    assert.equal(events[0]?.reason, "password_age_locked");
  });

  it("invalid username runs rate-limit then skip without verify", async () => {
    const rl = spy_rate_limit();
    let verified = 0;
    const { deps, events } = await pipeline_deps({
      rate_limit: rl,
      verify_password: async () => {
        verified += 1;
        return false;
      },
    });
    const result = await run_login_pipeline(ctx({ provided_username: "ab" }), deps);
    assert.equal(result.kind, "denied");
    assert.equal(verified, 0);
    assert.equal(rl.evaluated.length, 1);
    assert.equal(rl.evaluated[0]?.username_key, INVALID_OR_OVERSIZE);
    assert.equal(rl.recorded.length, 1);
    assert.equal(events[0]?.reason, "invalid_username");
    assert.equal(events[0]?.data.username_exists, false);
    assert.equal(events[0]?.event_type, "auth.failed");
  });

  it("well-formed unknown user uses dummy verify and its own username key", async () => {
    const rl = spy_rate_limit();
    const hashes: string[] = [];
    const { deps, events } = await pipeline_deps({
      rate_limit: rl,
      verify_password: async (password_hash) => {
        hashes.push(password_hash);
        return false;
      },
    });
    const result = await run_login_pipeline(
      ctx({ provided_username: "nobody" }),
      deps,
    );
    assert.equal(result.kind, "denied");
    assert.deepEqual(hashes, [TEST_DUMMY_HASH]);
    assert.equal(rl.evaluated[0]?.username_key, "nobody");
    assert.equal(events[0]?.reason, "unknown_user");
    assert.equal(events[0]?.data.username_exists, false);
  });

  it("empty and oversize passwords skip hash acquire", async () => {
    const limiter = make_hash_slot_limiter(() => 1);
    limiter.try_acquire();
    const rl = spy_rate_limit();
    const { deps, events } = await pipeline_deps({
      hash_slots: limiter,
      rate_limit: rl,
    });
    const empty = await run_login_pipeline(ctx({ password: "" }), deps);
    assert.equal(empty.kind, "denied");
    assert.equal(events[0]?.reason, "password_empty_or_oversize");
    assert.equal(rl.evaluated[0]?.username_key, "admin");
    const oversize = await run_login_pipeline(
      ctx({ password: "x".repeat(257) }),
      deps,
    );
    assert.equal(oversize.kind, "denied");
    assert.equal(rl.evaluated[1]?.username_key, "admin");
    assert.equal(limiter.in_use(), 1);
  });

  it("503 acquire-before-lookup does not load user or wait", async () => {
    const limiter = make_hash_slot_limiter(() => 1);
    limiter.try_acquire();
    let loaded = 0;
    const users = memory_users([TEST_ADMIN]);
    const orig = users.load_by_username.bind(users);
    users.load_by_username = async (folded) => {
      loaded += 1;
      return orig(folded);
    };
    const slept: number[] = [];
    const { deps, events } = await pipeline_deps({
      users,
      hash_slots: limiter,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.equal(result.kind, "capacity");
    assert.equal(loaded, 0);
    assert.deepEqual(slept, []);
    assert.equal(events[0]?.reason, "hash_capacity");
    assert.equal(events[0]?.severity, "warning");
    assert.equal((await users.load_by_username("admin"))?.failed_login_count, 0);
  });

  it("injected L3 skips verify", async () => {
    const rl = spy_rate_limit({ delay_ms: 2000, lockout: true });
    let verified = 0;
    const slept: number[] = [];
    const { deps } = await pipeline_deps({
      rate_limit: rl,
      now_ms: () => 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
      verify_password: async () => {
        verified += 1;
        return true;
      },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.equal(result.kind, "denied");
    assert.equal(verified, 0);
    assert.equal(rl.recorded.length, 1);
    assert.equal(slept[0], 2000);
  });

  it("failure waits remaining T plus RL delay as one sleep", async () => {
    const rl = spy_rate_limit({ delay_ms: 40, lockout: false });
    const slept: number[] = [];
    let t = 0;
    const { deps } = await pipeline_deps({
      rate_limit: rl,
      settings: test_login_settings({
        process_time_minimum_ms: 100,
        process_time_maximum_ms: 100,
      }),
      draw_t: () => 100,
      now_ms: () => {
        const now = t;
        t += 10;
        return now;
      },
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    const result = await run_login_pipeline(
      ctx({ password: "wrong-password" }),
      deps,
    );
    assert.equal(result.kind, "denied");
    assert.equal(slept.length, 1);
    assert.equal(slept[0], remaining_wait_ms(100, 40, 10));
  });

  it("account-dependent failure increments failed_login_count", async () => {
    const users = memory_users([TEST_ADMIN]);
    const { deps } = await pipeline_deps({ users });
    await run_login_pipeline(ctx({ password: "nope" }), deps);
    assert.equal((await users.load_by_username("admin"))?.failed_login_count, 1);
  });

  it("failed_count lockout denies even with the right password", async () => {
    const users = memory_users([{ ...TEST_ADMIN, failed_login_count: 5 }]);
    const { deps, events } = await pipeline_deps({ users });
    const result = await run_login_pipeline(ctx(), deps);
    assert.equal(result.kind, "denied");
    assert.equal(events[0]?.reason, "failed_count_lockout");
    assert.equal((await users.load_by_username("admin"))?.failed_login_count, 6);
  });

  it("inactive user still verifies then fails", async () => {
    const users = memory_users([{ ...TEST_ADMIN, is_active: false }]);
    let verified = 0;
    const { deps, events } = await pipeline_deps({
      users,
      verify_password: async (password_hash, password) => {
        verified += 1;
        return (
          password_hash === TEST_PASSWORD_HASH && password === "admin-change-me"
        );
      },
    });
    const result = await run_login_pipeline(ctx(), deps);
    assert.equal(result.kind, "denied");
    assert.equal(verified, 1);
    assert.equal(events[0]?.reason, "inactive");
    assert.equal(events[0]?.data.is_active, false);
  });

  it("events include request identity and never a password", async () => {
    const { deps, events } = await pipeline_deps();
    await run_login_pipeline(ctx({ password: "wrong-password" }), deps);
    const payload = JSON.stringify(events[0]);
    assert.equal(payload.includes("wrong-password"), false);
    assert.equal(payload.includes("admin-change-me"), false);
    assert.equal(events[0]?.ip_address, "203.0.113.9");
    assert.equal(events[0]?.data.protocol, "https");
    assert.equal(events[0]?.data.host, "localhost:8443");
    assert.equal(events[0]?.data.context_path, "/api/v2/auth/login");
    assert.equal(events[0]?.data.user_agent, "untangled-test");
    for (const key of [
      "event_type",
      "actor_channel",
      "outcome",
      "reason",
      "severity",
      "correlation_id",
      "user_id",
      "ip_address",
      "timestamp",
      "data",
    ]) {
      assert.ok(key in (events[0] ?? {}));
    }
  });
});

describe("login http outcomes", () => {
  async function with_server(
    overrides: Parameters<typeof test_config>[0],
    fn: (base_url: string, server: Server) => Promise<void>,
  ): Promise<void> {
    const config = await test_config(overrides);
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      await fn(base_url, server);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }

  async function csrf(base_url: string): Promise<{ token: string; cookie: string }> {
    const response = await fetch(`${base_url}/api/v2/auth/csrf`);
    const body = (await response.json()) as { csrf_token: string };
    const cookie = response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    return { token: body.csrf_token, cookie };
  }

  it("returns 401 Access denied without the failure reason", async () => {
    await with_server({}, async (base_url) => {
      const { token, cookie } = await csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: cookie,
          "X-CSRF-Token": token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=wrong-password",
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as { detail: string };
      assert.deepEqual(body, { detail: "Access denied" });
      assert.equal("reason" in body, false);
    });
  });

  it("returns 503 when the hash slot is held", async () => {
    const limiter = make_hash_slot_limiter(() => 1);
    limiter.try_acquire();
    await with_server({ hash_slots: limiter }, async (base_url) => {
      const { token, cookie } = await csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: cookie,
          "X-CSRF-Token": token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=admin-change-me",
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        detail: "Sign-in is temporarily busy. Try again in a moment.",
      });
    });
  });

  it("serves /health during a failure wait", async () => {
    await with_server(
      {
        settings: test_login_settings({
          process_time_minimum_ms: 150,
          process_time_maximum_ms: 150,
        }),
        draw_t: () => 150,
      },
      async (base_url) => {
        const { token, cookie } = await csrf(base_url);
        const login = fetch(`${base_url}/api/v2/auth/login`, {
          method: "POST",
          headers: {
            Origin: PUBLIC_ORIGIN,
            Cookie: cookie,
            "X-CSRF-Token": token,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "username=admin&password=wrong-password",
        });
        try {
          const winner = await Promise.race([
            fetch(`${base_url}/health`).then(async (response) => {
              assert.equal(response.status, 200);
              return "health" as const;
            }),
            login.then(() => "login" as const),
          ]);
          assert.equal(winner, "health");
        } finally {
          assert.equal((await login).status, 401);
        }
      },
    );
  });

  it("returns 500 when audit emit fails and does not set an access cookie", async () => {
    await with_server(
      {
        audit: {
          async emit() {
            throw new Error("injected audit failure");
          },
        },
      },
      async (base_url) => {
        const { token, cookie } = await csrf(base_url);
        const response = await fetch(`${base_url}/api/v2/auth/login`, {
          method: "POST",
          headers: {
            Origin: PUBLIC_ORIGIN,
            Cookie: cookie,
            "X-CSRF-Token": token,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "username=admin&password=admin-change-me",
        });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { detail: "Internal error" });
        const set_cookies = response.headers.getSetCookie().join("\n");
        assert.equal(set_cookies.includes(`${ACCESS_COOKIE_NAME}=`), false);
      },
    );
  });

  it("persists an audit event on success when the sink is writable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "untangled-audit-http-"));
    try {
      const sink = make_file_audit_sink(directory, { pid: 99 });
      await with_server({ audit: sink }, async (base_url) => {
        const { token, cookie } = await csrf(base_url);
        const response = await fetch(`${base_url}/api/v2/auth/login`, {
          method: "POST",
          headers: {
            Origin: PUBLIC_ORIGIN,
            Cookie: cookie,
            "X-CSRF-Token": token,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "username=admin&password=admin-change-me",
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
        const names = await readdir(directory);
        assert.equal(names.length, 1);
        assert.match(names[0] ?? "", /^audit-\d{8}T\d{6}Z-99-1\.ndjson$/);
        const payload = await readFile(join(directory, names[0] ?? ""), "utf8");
        assert.equal(payload.includes("login_ok"), true);
        assert.equal(payload.includes("admin-change-me"), false);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON with 400", async () => {
    await with_server({}, async (base_url) => {
      const { token, cookie } = await csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: cookie,
          "X-CSRF-Token": token,
          "Content-Type": "application/json",
        },
        body: "{not-json",
      });
      assert.equal(response.status, 400);
    });
  });
});
