import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { jwtVerify } from "jose";

import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  parse_cookie_header,
} from "../src/cookies.js";
import { make_hash_slot_limiter } from "../src/hash_slots.js";
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

function max_age(line: string): number {
  const match = /Max-Age=(\d+)/i.exec(line);
  assert.ok(match != null && match[1] != null);
  return Number(match[1]);
}

describe("login creates a server session", () => {
  const sessions = memory_sessions();
  let server: Server;
  let base_url: string;
  let public_key: CryptoKey;
  let hmac_secret: Buffer;

  before(async () => {
    const config = await test_config({
      sessions,
      settings: test_login_settings({
        session_access_ttl_seconds: 900,
        session_refresh_ttl_seconds: 3600,
        session_total_ttl_seconds: 7200,
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

  async function issue_csrf(): Promise<{ token: string; cookie: string }> {
    const response = await fetch(`${base_url}/api/v2/auth/csrf`);
    const body = (await response.json()) as { csrf_token: string };
    return { token: body.csrf_token, cookie: `${CSRF_COOKIE_NAME}=${body.csrf_token}` };
  }

  async function login(args: {
    password?: string;
    user_agent?: string;
    forwarded?: string;
  } = {}): Promise<Response> {
    const { token, cookie } = await issue_csrf();
    const headers: Record<string, string> = {
      Origin: PUBLIC_ORIGIN,
      Cookie: cookie,
      "X-CSRF-Token": token,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (args.user_agent != null) {
      headers["User-Agent"] = args.user_agent;
    }
    if (args.forwarded != null) {
      headers.Forwarded = args.forwarded;
    }
    return fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers,
      body: `username=admin&password=${args.password ?? "admin-change-me"}`,
    });
  }

  it("creates a session, sid, and path-scoped refresh cookie on normal login", async () => {
    const before_count = sessions.rows.length;
    const response = await login({
      user_agent: "untangled-session-test",
      forwarded: "for=203.0.113.9;proto=https;host=localhost:8443",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal("access_token" in body, false);
    assert.equal("refresh_token" in body, false);

    const set_cookies = response.headers.getSetCookie();
    const access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
    const refresh_line = cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME);
    assert.ok(access_line != null);
    assert.ok(refresh_line != null);
    assert.match(access_line, /Path=\/(?:;|$)/);
    assert.doesNotMatch(access_line, /Path=\/api\/v2\/auth\/refresh/);
    assert.match(refresh_line, /HttpOnly/i);
    assert.match(refresh_line, /Secure/i);
    assert.match(refresh_line, /SameSite=Lax/i);
    assert.match(refresh_line, new RegExp(`Path=${REFRESH_COOKIE_PATH.replaceAll("/", "\\/")}`));
    assert.doesNotMatch(refresh_line, /Domain=/i);
    assert.equal(max_age(access_line), 3600);
    assert.equal(max_age(refresh_line), 3600);

    const access = cookie_value(set_cookies, ACCESS_COOKIE_NAME);
    const refresh = cookie_value(set_cookies, REFRESH_COOKIE_NAME);
    assert.ok(access != null);
    assert.ok(refresh != null);
    const { payload } = await jwtVerify(access, public_key, { algorithms: ["ES256"] });
    assert.equal(payload.sub, TEST_USER_ID);
    assert.equal(typeof payload.sid, "string");
    assert.equal(payload.password_change_required, undefined);
    assert.equal((payload.exp as number) - (payload.iat as number), 900);

    assert.equal(sessions.rows.length, before_count + 1);
    const row = sessions.rows[sessions.rows.length - 1];
    assert.ok(row != null);
    assert.equal(row.id, payload.sid);
    assert.equal(row.user_id, TEST_USER_ID);
    assert.equal(row.refresh_hmac, hmac_refresh_token(hmac_secret, refresh));
    assert.equal(row.ip_address, "203.0.113.9");
    assert.equal(row.user_agent, "untangled-session-test");
    const session_span =
      Math.round((row.session_expires_at.getTime() - row.refresh_expires_at.getTime()) / 1000) +
      3600;
    assert.equal(session_span, 7200);
    assert.ok(row.refresh_expires_at.getTime() < row.session_expires_at.getTime());
  });

  it("does not create a session on failed login", async () => {
    const before_count = sessions.rows.length;
    const response = await login({ password: "wrong-password" });
    assert.equal(response.status, 401);
    assert.equal(
      cookie_from_set_cookie(response.headers.getSetCookie(), REFRESH_COOKIE_NAME),
      undefined,
    );
    assert.equal(sessions.rows.length, before_count);
  });
});

describe("must-change login session", () => {
  it("stores a null HMAC, no refresh cookie, and JWT-lifetime access Max-Age", async () => {
    const sessions = memory_sessions();
    const users = memory_users([
      {
        ...TEST_ADMIN,
        password_expires_at: new Date(Date.now() - 60_000),
      },
    ]);
    const config = await test_config({
      sessions,
      users,
      settings: test_login_settings({
        session_access_ttl_seconds: 900,
        session_refresh_ttl_seconds: 3600,
        session_total_ttl_seconds: 7200,
      }),
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const csrf = await fetch(`${base_url}/api/v2/auth/csrf`);
      const csrf_body = (await csrf.json()) as { csrf_token: string };
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${CSRF_COOKIE_NAME}=${csrf_body.csrf_token}`,
          "X-CSRF-Token": csrf_body.csrf_token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=admin-change-me",
      });
      assert.equal(response.status, 200);
      const set_cookies = response.headers.getSetCookie();
      assert.equal(cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME), undefined);
      const access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
      assert.ok(access_line != null);
      assert.equal(max_age(access_line), 900);
      const access = cookie_value(set_cookies, ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const { payload } = await jwtVerify(access, config.public_key, {
        algorithms: ["ES256"],
      });
      assert.equal(payload.password_change_required, true);
      assert.equal(typeof payload.sid, "string");
      assert.equal(sessions.rows.length, 1);
      const row = sessions.rows[0];
      assert.ok(row != null);
      assert.equal(row.refresh_hmac, null);
      assert.equal(row.id, payload.sid);
      assert.equal(
        Math.round(row.refresh_expires_at.getTime() / 1000),
        payload.exp,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

describe("login session failure paths", () => {
  it("does not create a session on hash-capacity 503", async () => {
    const sessions = memory_sessions();
    const limiter = make_hash_slot_limiter(() => 1);
    limiter.try_acquire();
    const config = await test_config({ sessions, hash_slots: limiter });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const csrf = await fetch(`${base_url}/api/v2/auth/csrf`);
      const csrf_body = (await csrf.json()) as { csrf_token: string };
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${CSRF_COOKIE_NAME}=${csrf_body.csrf_token}`,
          "X-CSRF-Token": csrf_body.csrf_token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=admin-change-me",
      });
      assert.equal(response.status, 503);
      assert.equal(
        cookie_from_set_cookie(response.headers.getSetCookie(), REFRESH_COOKIE_NAME),
        undefined,
      );
      assert.equal(sessions.rows.length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("returns 500 with no cookies when session insert fails", async () => {
    const config = await test_config({
      sessions: {
        async create() {
          throw new Error("injected session insert failure");
        },
      },
    });
    const server = create_server(config);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const base_url = `http://127.0.0.1:${address.port}`;
    try {
      const csrf = await fetch(`${base_url}/api/v2/auth/csrf`);
      const csrf_body = (await csrf.json()) as { csrf_token: string };
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: PUBLIC_ORIGIN,
          Cookie: `${CSRF_COOKIE_NAME}=${csrf_body.csrf_token}`,
          "X-CSRF-Token": csrf_body.csrf_token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=admin-change-me",
      });
      assert.equal(response.status, 500);
      const set_cookies = response.headers.getSetCookie();
      assert.equal(cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME), undefined);
      assert.equal(cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME), undefined);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
