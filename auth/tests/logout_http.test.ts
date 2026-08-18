import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { AuditEvent } from "../src/audit.js";
import {
  AUTH_CSRF_DENIED,
  AUTH_LOGOUT,
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
import { AUTH_SESSION_PATHS } from "../src/http.js";
import { sign_access_token } from "../src/jwt.js";
import { ACCESS_DENIED } from "../src/login_settings.js";
import { hmac_refresh_token } from "../src/refresh_hmac.js";
import { create_server } from "../src/server.js";
import {
  PUBLIC_ORIGIN,
  TEST_USER_ID,
  memory_sessions,
  test_config,
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

describe("POST /api/v2/auth/logout", () => {
  const sessions = memory_sessions();
  const audit_events: AuditEvent[] = [];
  let server: Server;
  let base_url: string;
  let private_key: CryptoKey;
  let hmac_secret: Buffer;

  before(async () => {
    const config = await test_config({
      sessions,
      audit_events,
    });
    private_key = config.private_key;
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

  async function issue_csrf(): Promise<{ token: string; cookie: string }> {
    const response = await fetch(`${base_url}/api/v2/auth/csrf`);
    const body = (await response.json()) as { csrf_token: string };
    return { token: body.csrf_token, cookie: `${CSRF_COOKIE_NAME}=${body.csrf_token}` };
  }

  async function login(args: { must_change?: boolean } = {}): Promise<{
    access: string;
    refresh: string | undefined;
    csrf_token: string;
    csrf_cookie: string;
  }> {
    if (args.must_change === true) {
      const sid = "01900000-0000-7000-8000-0000000000cc";
      await sessions.create({
        id: sid,
        user_id: TEST_USER_ID,
        refresh_hmac: null,
        session_expires_at: new Date(Date.now() + 7200_000),
        refresh_expires_at: new Date(Date.now() + 900_000),
        ip_address: null,
        user_agent: null,
      });
      const access = await sign_access_token(private_key, TEST_USER_ID, {
        ttl_seconds: 900,
        sid,
        password_change_required: true,
      });
      const csrf = await issue_csrf();
      return {
        access,
        refresh: undefined,
        csrf_token: csrf.token,
        csrf_cookie: csrf.cookie,
      };
    }
    const { token, cookie } = await issue_csrf();
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
    return { access, refresh, csrf_token: token, csrf_cookie: cookie };
  }

  async function post_logout(args: {
    access?: string | null;
    bearer?: boolean;
    refresh?: string;
    csrf_token?: string;
    csrf_cookie?: string;
    origin?: string;
    extra_json?: Record<string, unknown>;
    user_agent?: string;
    forwarded?: string;
  } = {}): Promise<Response> {
    const csrf =
      args.csrf_token != null && args.csrf_cookie != null
        ? { token: args.csrf_token, cookie: args.csrf_cookie }
        : await issue_csrf();
    const cookies = cookie_header([
      csrf.cookie,
      args.access != null && args.access !== "" && args.bearer !== true
        ? `${ACCESS_COOKIE_NAME}=${args.access}`
        : "",
      args.refresh != null ? `${REFRESH_COOKIE_NAME}=${args.refresh}` : "",
    ]);
    const headers: Record<string, string> = {
      Origin: args.origin ?? PUBLIC_ORIGIN,
      Cookie: cookies,
      "X-CSRF-Token": csrf.token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (args.bearer === true && args.access != null && args.access !== "") {
      headers.Authorization = `Bearer ${args.access}`;
    }
    if (args.user_agent != null) {
      headers["User-Agent"] = args.user_agent;
    }
    if (args.forwarded != null) {
      headers.Forwarded = args.forwarded;
    }
    return fetch(`${base_url}${AUTH_SESSION_PATHS.logout}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args.extra_json ?? {}),
    });
  }

  it("exposes logout on the auth-session path contract", () => {
    assert.equal(AUTH_SESSION_PATHS.logout, "/api/v2/auth/logout");
  });

  it("rejects GET and other non-POST methods without deleting", async () => {
    const before = sessions.rows.length;
    const get = await fetch(`${base_url}/api/v2/auth/logout`);
    const put = await fetch(`${base_url}/api/v2/auth/logout`, { method: "PUT" });
    assert.equal(get.status, 405);
    assert.equal(put.status, 405);
    assert.equal(sessions.rows.length, before);
  });

  it("rejects origin mismatch without deleting", async () => {
    const before = sessions.rows.length;
    audit_events.length = 0;
    const response = await post_logout({ origin: "https://evil.example" });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { detail: string };
    assert.equal(body.detail, "Forbidden");
    assert.equal(sessions.rows.length, before);
    assert.equal(audit_events[0]?.event_type, AUTH_CSRF_DENIED);
    assert.equal(audit_events[0]?.reason, CSRF_DENIED_ORIGIN);
  });

  it("rejects csrf mismatch without deleting", async () => {
    const { access, csrf_cookie } = await login();
    const before = sessions.rows.length;
    audit_events.length = 0;
    const other = await issue_csrf();
    const response = await post_logout({
      access,
      csrf_token: other.token,
      csrf_cookie,
    });
    assert.equal(response.status, 403);
    assert.equal(sessions.rows.length, before);
    assert.equal(audit_events[0]?.event_type, AUTH_CSRF_DENIED);
    assert.equal(audit_events[0]?.reason, CSRF_DENIED_CSRF);
  });

  it("deletes this session, expires both cookies, and emits auth.logout", async () => {
    const { access, refresh } = await login();
    const other = await login();
    audit_events.length = 0;
    const response = await post_logout({
      access,
      refresh,
      user_agent: "logout-browser",
      forwarded: "for=203.0.113.9;proto=https;host=localhost:8443",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    const set_cookies = response.headers.getSetCookie();
    const access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
    const refresh_line = cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME);
    assert.ok(access_line != null);
    assert.ok(refresh_line != null);
    assert.match(access_line, /Max-Age=0/);
    assert.match(access_line, /Path=\/(?:;|$)/);
    assert.doesNotMatch(access_line, /Domain=/i);
    assert.match(refresh_line, /Max-Age=0/);
    assert.match(refresh_line, /HttpOnly/i);
    assert.match(refresh_line, /SameSite=Lax/i);
    assert.match(
      refresh_line,
      new RegExp(`Path=${REFRESH_COOKIE_PATH.replaceAll("/", "\\/")}`),
    );
    assert.doesNotMatch(refresh_line, /Domain=/i);
    assert.equal(
      sessions.rows.some((row) => row.refresh_hmac === hmac_refresh_token(hmac_secret, refresh ?? "")),
      false,
    );
    assert.ok(other.refresh != null);
    assert.equal(
      sessions.rows.some(
        (row) => row.refresh_hmac === hmac_refresh_token(hmac_secret, other.refresh ?? ""),
      ),
      true,
    );
    const event = audit_events.find((item) => item.event_type === AUTH_LOGOUT);
    assert.ok(event != null);
    assert.equal(event.user_id, TEST_USER_ID);
    assert.equal(event.ip_address, "203.0.113.9");
    assert.equal(event.data.user_agent, "logout-browser");
  });

  it("accepts a claim-expired Bearer JWT and does not require a refresh cookie", async () => {
    const sid = "01900000-0000-7000-8000-0000000000dd";
    await sessions.create({
      id: sid,
      user_id: TEST_USER_ID,
      refresh_hmac: hmac_refresh_token(hmac_secret, "unused"),
      session_expires_at: new Date(Date.now() + 7200_000),
      refresh_expires_at: new Date(Date.now() + 3600_000),
      ip_address: null,
      user_agent: null,
    });
    const access = await sign_access_token(private_key, TEST_USER_ID, {
      ttl_seconds: 60,
      sid,
      now: new Date(Date.now() - 120_000),
    });
    const before_other = sessions.rows.length;
    const response = await post_logout({ access, bearer: true });
    assert.equal(response.status, 200);
    assert.equal(
      sessions.rows.some((row) => row.id === sid),
      false,
    );
    assert.ok(sessions.rows.length < before_other);
  });

  it("logs out a must-change session with null refresh hmac", async () => {
    const { access } = await login({ must_change: true });
    const response = await post_logout({ access });
    assert.equal(response.status, 200);
    assert.equal(
      sessions.rows.some((row) => row.id === "01900000-0000-7000-8000-0000000000cc"),
      false,
    );
  });

  it("returns 401 for an invalid JWT without deleting and ignores a body refresh token", async () => {
    const { refresh } = await login();
    const before = sessions.rows.length;
    const response = await post_logout({
      access: "not-a-jwt",
      extra_json: { refresh_token: refresh },
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { detail: string };
    assert.equal(body.detail, ACCESS_DENIED);
    assert.equal(sessions.rows.length, before);
    assert.equal(
      sessions.rows.some(
        (row) => row.refresh_hmac === hmac_refresh_token(hmac_secret, refresh ?? ""),
      ),
      true,
    );
  });

  it("returns 200 and re-emits auth.logout when the row is already gone", async () => {
    const { access } = await login();
    assert.equal((await post_logout({ access })).status, 200);
    audit_events.length = 0;
    const second = await post_logout({ access });
    assert.equal(second.status, 200);
    assert.equal(audit_events[0]?.event_type, AUTH_LOGOUT);
  });
});
