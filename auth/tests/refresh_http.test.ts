import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { jwtVerify } from "jose";

import type { AuditEvent, AuditSink } from "../src/audit.js";
import {
  AUTH_CSRF_DENIED,
  AUTH_REFRESH,
  AUTH_REFRESH_REUSE,
  CSRF_DENIED_CSRF,
  CSRF_DENIED_ORIGIN,
} from "../src/audit.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  parse_cookie_header,
} from "../src/cookies.js";
import { sign_access_token } from "../src/jwt.js";
import { ACCESS_DENIED, SERVICE_UNAVAILABLE } from "../src/login_settings.js";
import { hmac_refresh_token } from "../src/refresh_hmac.js";
import { create_server } from "../src/server.js";
import {
  PUBLIC_ORIGIN,
  TEST_ADMIN,
  TEST_USER_ID,
  memory_sessions,
  memory_users,
  test_config,
  test_login_settings,
} from "./helpers.js";

function cookie_from_set_cookie(set_cookies: string[], name: string): string | undefined {
  for (const line of set_cookies) {
    const parsed = parse_cookie_header(line.split(";")[0]);
    if (parsed.has(name)) {
      return line;
    }
  }
  return undefined;
}

function cookie_value(set_cookies: string[], name: string): string | undefined {
  const line = cookie_from_set_cookie(set_cookies, name);
  if (line == null) {
    return undefined;
  }
  return parse_cookie_header(line.split(";")[0])?.get(name);
}

function cookie_header(parts: string[]): string {
  return parts.filter((part) => part !== "").join("; ");
}

async function issue_csrf(base_url: string): Promise<{ token: string; cookie: string }> {
  const response = await fetch(`${base_url}/api/v2/auth/csrf`);
  const body = (await response.json()) as { csrf_token: string };
  return { token: body.csrf_token, cookie: `${CSRF_COOKIE_NAME}=${body.csrf_token}` };
}

describe("POST /api/v2/auth/refresh", () => {
  const sessions = memory_sessions();
  const audit_events: AuditEvent[] = [];
  const sleeps: number[] = [];
  let server: Server;
  let base_url: string;
  let public_key: CryptoKey;
  let hmac_secret: Buffer;

  before(async () => {
    const config = await test_config({
      sessions,
      audit_events,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      draw_t: () => 40,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_access_ttl_seconds: 900,
        session_refresh_ttl_seconds: 3600,
        session_total_ttl_seconds: 7200,
        session_refresh_reuse_grace_seconds: 15,
        session_refresh_reuse_window_seconds: 86400,
        session_refresh_process_time_minimum: 40,
        session_refresh_process_time_maximum: 40,
      }),
    });
    public_key = config.public_key;
    hmac_secret = config.refresh_hmac_secret;
    server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    base_url = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function login(): Promise<{
    access: string;
    refresh: string;
    csrf_token: string;
    csrf_cookie: string;
  }> {
    const { token, cookie } = await issue_csrf(base_url);
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
    const set_cookies = response.headers.getSetCookie();
    const access = cookie_value(set_cookies, ACCESS_COOKIE_NAME);
    const refresh = cookie_value(set_cookies, REFRESH_COOKIE_NAME);
    assert.ok(access != null);
    assert.ok(refresh != null);
    return { access, refresh, csrf_token: token, csrf_cookie: cookie };
  }

  async function post_refresh(args: {
    access?: string;
    refresh?: string;
    csrf_token?: string;
    csrf_cookie?: string;
    origin?: string;
    extra_json?: Record<string, unknown>;
    user_agent?: string;
  }): Promise<Response> {
    const csrf =
      args.csrf_token != null && args.csrf_cookie != null
        ? { token: args.csrf_token, cookie: args.csrf_cookie }
        : await issue_csrf(base_url);
    const cookies = cookie_header([
      args.csrf_cookie ?? csrf.cookie,
      args.access != null ? `${ACCESS_COOKIE_NAME}=${args.access}` : "",
      args.refresh != null ? `${REFRESH_COOKIE_NAME}=${args.refresh}` : "",
    ]);
    const headers: Record<string, string> = {
      Cookie: cookies,
      "X-CSRF-Token": args.csrf_token ?? csrf.token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (args.origin !== "") {
      headers.Origin = args.origin ?? PUBLIC_ORIGIN;
    }
    if (args.user_agent != null) {
      headers["User-Agent"] = args.user_agent;
    }
    return fetch(`${base_url}/api/v2/auth/refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify(args.extra_json ?? {}),
    });
  }

  it("rejects CSRF origin mismatch without rotating", async () => {
    const before = sessions.rows.length;
    const response = await post_refresh({ origin: "https://evil.example" });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { detail: "Forbidden" });
    const event = audit_events[audit_events.length - 1];
    assert.equal(event?.event_type, AUTH_CSRF_DENIED);
    assert.equal(event?.reason, CSRF_DENIED_ORIGIN);
    assert.equal(sessions.rows.length, before);
    assert.equal(sleeps.length, 0);
  });

  it("rejects CSRF token mismatch without rotating", async () => {
    const { cookie } = await issue_csrf(base_url);
    const response = await post_refresh({
      csrf_cookie: cookie,
      csrf_token: "not-the-cookie",
    });
    assert.equal(response.status, 403);
    const event = audit_events[audit_events.length - 1];
    assert.equal(event?.event_type, AUTH_CSRF_DENIED);
    assert.equal(event?.reason, CSRF_DENIED_CSRF);
    assert.equal(sleeps.length, 0);
  });

  it("returns 405 on GET without Set-Cookie or session work", async () => {
    const before_sessions = sessions.rows.length;
    const before_used = sessions.used.length;
    const response = await fetch(`${base_url}/api/v2/auth/refresh`);
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { detail: "Method not allowed" });
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal(sessions.rows.length, before_sessions);
    assert.equal(sessions.used.length, before_used);
    assert.equal(sleeps.length, 0);
  });

  it("rotates the refresh token and skips access Set-Cookie when JWT is live", async () => {
    const { access, refresh } = await login();
    const { payload: login_payload } = await jwtVerify(access, public_key, {
      algorithms: ["ES256"],
    });
    const sid = login_payload.sid as string;
    const row = sessions.rows.find((candidate) => candidate.id === sid);
    assert.ok(row != null);
    const session_expires_at = row.session_expires_at.getTime();
    const sleeps_before = sleeps.length;
    const response = await post_refresh({
      access,
      refresh,
      user_agent: "refresh-ua",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const set_cookies = response.headers.getSetCookie();
    const new_refresh = cookie_value(set_cookies, REFRESH_COOKIE_NAME);
    const new_access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
    assert.ok(new_refresh != null);
    assert.notEqual(new_refresh, refresh);
    const refresh_line = cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME);
    assert.ok(refresh_line != null);
    assert.match(
      refresh_line,
      new RegExp(`Path=${REFRESH_COOKIE_PATH.replaceAll("/", "\\/")}`),
    );
    assert.equal(new_access_line, undefined);
    const updated = sessions.rows.find((candidate) => candidate.id === sid);
    assert.ok(updated != null);
    assert.equal(updated.session_expires_at.getTime(), session_expires_at);
    assert.equal(updated.refresh_hmac, hmac_refresh_token(hmac_secret, new_refresh));
    assert.equal(updated.user_agent, "refresh-ua");
    assert.equal(
      sessions.used.filter((entry) => entry.session_id === sid).length,
      1,
    );
    const event = audit_events[audit_events.length - 1];
    assert.equal(event?.event_type, AUTH_REFRESH);
    assert.equal(event?.reason, "refresh_ok");
    assert.equal(event?.user_id, TEST_USER_ID);
    assert.equal(sleeps.length, sleeps_before);
    const payload = JSON.stringify(event);
    assert.equal(payload.includes(refresh), false);
    assert.equal(payload.includes(new_refresh), false);
  });

  it("ignores a refresh token in the JSON body", async () => {
    const { access, refresh } = await login();
    const sleeps_before = sleeps.length;
    const response = await post_refresh({
      access,
      extra_json: { refresh_token: refresh },
    });
    assert.equal(response.status, 401);
    const denied = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(denied, { detail: ACCESS_DENIED });
    assert.equal("retry" in denied, false);
    const event = audit_events[audit_events.length - 1];
    assert.equal(event?.event_type, AUTH_REFRESH);
    assert.equal(event?.reason, "missing_cookie");
    assert.ok(sleeps.length > sleeps_before);
  });

  it("soft-fails replay within grace without invalidating", async () => {
    const { access, refresh } = await login();
    const first = await post_refresh({ access, refresh });
    assert.equal(first.status, 200);
    const session_count = sessions.rows.length;
    const used_count = sessions.used.length;
    const current_hmac = sessions.rows[sessions.rows.length - 1]?.refresh_hmac;
    const sleeps_before = sleeps.length;
    const replay = await post_refresh({ access, refresh });
    assert.equal(replay.status, 401);
    assert.deepEqual(await replay.json(), {
      detail: ACCESS_DENIED,
      retry: true,
      max_retries: 5,
    });
    assert.equal(cookie_from_set_cookie(replay.headers.getSetCookie(), REFRESH_COOKIE_NAME), undefined);
    assert.equal(sessions.rows.length, session_count);
    assert.equal(sessions.used.length, used_count);
    assert.equal(sessions.rows[sessions.rows.length - 1]?.refresh_hmac, current_hmac);
    assert.equal(
      audit_events[audit_events.length - 1]?.event_type === AUTH_REFRESH_REUSE,
      false,
    );
    assert.equal(sleeps.length, sleeps_before);
  });

  it("hard-fails replay after grace, tears down the chain, and waits", async () => {
    const { access, refresh } = await login();
    const first = await post_refresh({ access, refresh });
    assert.equal(first.status, 200);
    const used = sessions.used[sessions.used.length - 1];
    assert.ok(used != null);
    used.used_at = new Date(used.used_at.getTime() - 20_000);
    const sleeps_before = sleeps.length;
    const { payload } = await jwtVerify(access, public_key, { algorithms: ["ES256"] });
    const sid = payload.sid;
    const replay = await post_refresh({ access, refresh });
    assert.equal(replay.status, 401);
    assert.deepEqual(await replay.json(), { detail: ACCESS_DENIED });
    assert.equal(
      sessions.rows.some((row) => row.id === sid),
      false,
    );
    assert.equal(
      sessions.used.some((row) => row.session_id === sid),
      false,
    );
    const event = audit_events[audit_events.length - 1];
    assert.equal(event?.event_type, AUTH_REFRESH_REUSE);
    assert.ok(sleeps.length > sleeps_before);
  });
});

describe("refresh expired access JWT", () => {
  it("mints a new access cookie when the presented JWT is expired", async () => {
    const sessions = memory_sessions();
    const config = await test_config({
      sessions,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_access_ttl_seconds: 1,
        session_refresh_ttl_seconds: 3600,
        session_total_ttl_seconds: 7200,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
      draw_t: () => 0,
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      assert.equal(login.status, 200);
      const login_cookies = login.headers.getSetCookie();
      const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
      const refresh = cookie_value(login_cookies, REFRESH_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(refresh != null);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 200);
      const set_cookies = response.headers.getSetCookie();
      const new_access = cookie_value(set_cookies, ACCESS_COOKIE_NAME);
      assert.ok(new_access != null);
      const { payload } = await jwtVerify(new_access, config.public_key, {
        algorithms: ["ES256"],
      });
      assert.equal(payload.sub, TEST_USER_ID);
      assert.equal(typeof payload.sid, "string");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("refreshes when the access JWT is days old but the session is still idle-valid", async () => {
    const sessions = memory_sessions();
    const config = await test_config({
      sessions,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_access_ttl_seconds: 900,
        session_refresh_ttl_seconds: 604800,
        session_total_ttl_seconds: 2592000,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
      draw_t: () => 0,
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const login_cookies = login.headers.getSetCookie();
      const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
      const refresh = cookie_value(login_cookies, REFRESH_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(refresh != null);
      const { payload: live } = await jwtVerify(access, config.public_key, {
        algorithms: ["ES256"],
      });
      assert.equal(typeof live.sid, "string");
      const stale_access = await sign_access_token(
        config.private_key,
        live.sub as string,
        {
          ttl_seconds: 900,
          sid: live.sid as string,
          now: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000),
        },
      );
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${stale_access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 200);
      const new_access = cookie_value(
        response.headers.getSetCookie(),
        ACCESS_COOKIE_NAME,
      );
      assert.ok(new_access != null);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

describe("refresh must-change and audit failures", () => {
  it("hard-fails must-change sessions", async () => {
    const sessions = memory_sessions();
    const users = memory_users([
      {
        ...TEST_ADMIN,
        password_expires_at: new Date(Date.now() - 60_000),
      },
    ]);
    const sleeps: number[] = [];
    const config = await test_config({
      sessions,
      users,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      draw_t: () => 25,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 25,
        session_refresh_process_time_maximum: 25,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      assert.equal(login.status, 200);
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=dummy-refresh`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { detail: ACCESS_DENIED });
      assert.equal(sessions.rows.length, 1);
      assert.ok(sleeps.length > 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("invalidates the session and returns 503 when success audit fails", async () => {
    const sessions = memory_sessions();
    const inner: AuditEvent[] = [];
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH && event.reason === "refresh_ok") {
          throw new Error("audit disk full");
        }
        inner.push(event);
      },
    };
    const config = await test_config({
      sessions,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const login_cookies = login.headers.getSetCookie();
      const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
      const refresh = cookie_value(login_cookies, REFRESH_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(refresh != null);
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { detail: SERVICE_UNAVAILABLE });
      assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), REFRESH_COOKIE_NAME), undefined);
      assert.equal(sessions.rows.length, 0);
      assert.equal(sessions.used.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("returns 503 after hard reuse if the reuse event cannot be written", async () => {
    const sessions = memory_sessions();
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH_REUSE) {
          throw new Error("audit disk full");
        }
      },
    };
    const config = await test_config({
      sessions,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_reuse_grace_seconds: 5,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const login_cookies = login.headers.getSetCookie();
      const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
      const refresh = cookie_value(login_cookies, REFRESH_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(refresh != null);
      const csrf1 = await issue_csrf(base_url);
      const first = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf1.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
          "X-CSRF-Token": csrf1.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(first.status, 200);
      const used = sessions.used[0];
      assert.ok(used != null);
      used.used_at = new Date(used.used_at.getTime() - 20_000);
      const csrf2 = await issue_csrf(base_url);
      const replay = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf2.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
          "X-CSRF-Token": csrf2.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(replay.status, 503);
      assert.deepEqual(await replay.json(), { detail: SERVICE_UNAVAILABLE });
      assert.equal(sessions.rows.length, 0);
      assert.equal(sessions.used.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("returns 503 when an ordinary hard-fail event cannot be written", async () => {
    const sessions = memory_sessions();
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH && event.reason === "missing_cookie") {
          throw new Error("audit disk full");
        }
      },
    };
    const config = await test_config({
      sessions,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.equal(sessions.rows.length, 0);
      assert.equal(sessions.used.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("invalidates when an unknown-token hard-fail event cannot be written", async () => {
    const sessions = memory_sessions();
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH && event.reason === "unknown_token") {
          throw new Error("audit disk full");
        }
      },
    };
    const config = await test_config({
      sessions,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=not-this-session`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.equal(sessions.rows.length, 0);
      assert.equal(sessions.used.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("invalidates when a must-change hard-fail event cannot be written", async () => {
    const sessions = memory_sessions();
    const users = memory_users([
      {
        ...TEST_ADMIN,
        password_expires_at: new Date(Date.now() - 60_000),
      },
    ]);
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH && event.reason === "must_change") {
          throw new Error("audit disk full");
        }
      },
    };
    const config = await test_config({
      sessions,
      users,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const { token, cookie } = await issue_csrf(base_url);
      const login = await fetch(`${base_url}/api/v2/auth/login`, {
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
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=dummy-refresh`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.equal(sessions.rows.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("does not delete a session when invalid JWT audit fails", async () => {
    const sessions = memory_sessions();
    await sessions.create({
      id: "01900000-0000-7000-8000-0000000000aa",
      user_id: TEST_USER_ID,
      refresh_hmac: "abc",
      session_expires_at: new Date(Date.now() + 86_400_000),
      refresh_expires_at: new Date(Date.now() + 3_600_000),
      ip_address: null,
      user_agent: null,
    });
    const audit: AuditSink = {
      async emit(event) {
        if (event.event_type === AUTH_REFRESH && event.reason === "invalid_jwt") {
          throw new Error("audit disk full");
        }
      },
    };
    const config = await test_config({
      sessions,
      audit,
      draw_t: () => 0,
      settings: test_login_settings({
        process_time_minimum_ms: 0,
        process_time_maximum_ms: 0,
        session_refresh_process_time_minimum: 0,
        session_refresh_process_time_maximum: 0,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const csrf = await issue_csrf(base_url);
      const response = await fetch(`${base_url}/api/v2/auth/refresh`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${csrf.cookie}; ${ACCESS_COOKIE_NAME}=not-a-jwt; ${REFRESH_COOKIE_NAME}=dummy`,
          "X-CSRF-Token": csrf.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.equal(sessions.rows.length, 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
