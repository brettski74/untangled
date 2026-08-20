import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { jwtVerify } from "jose";

import { SELECT_USER_FOR_UPDATE_SQL } from "../src/change_password_apply.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  parse_cookie_header,
} from "../src/cookies.js";
import { hmac_refresh_token } from "../src/refresh_hmac.js";
import { make_hash_slot_limiter } from "../src/hash_slots.js";
import { create_server } from "../src/server.js";
import { memory_sessions } from "../src/sessions.js";
import {
  PUBLIC_ORIGIN,
  TEST_ADMIN,
  TEST_USER_ID,
  memory_users,
  test_config,
  test_login_settings,
} from "./helpers.js";

const STRONG_NEW = "orchid-lantern-quasar-7N!pQ2xm";
const OTHER_SESSION_ID = "01900000-0000-7000-8000-0000000000bb";

function cookie_from_set_cookie(
  set_cookies: string[],
  name: string,
): string | undefined {
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

async function listen(config: Awaited<ReturnType<typeof test_config>>): Promise<{
  server: Server;
  base_url: string;
}> {
  const server = create_server(config);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, base_url: `http://127.0.0.1:${address.port}` };
}

async function close_server(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function issue_csrf(
  base_url: string,
): Promise<{ token: string; cookie: string }> {
  const response = await fetch(`${base_url}/api/v2/auth/csrf`);
  const body = (await response.json()) as { csrf_token: string };
  return {
    token: body.csrf_token,
    cookie: `${CSRF_COOKIE_NAME}=${body.csrf_token}`,
  };
}

async function login_json(
  base_url: string,
  args: { user_agent?: string; forwarded?: string } = {},
): Promise<Response> {
  const { token, cookie } = await issue_csrf(base_url);
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
    body: "username=admin&password=admin-change-me",
  });
}

async function change_password(
  base_url: string,
  access: string,
  body: Record<string, unknown>,
  args: { user_agent?: string; forwarded?: string } = {},
): Promise<Response> {
  const { token, cookie } = await issue_csrf(base_url);
  const headers: Record<string, string> = {
    Origin: PUBLIC_ORIGIN,
    Cookie: `${cookie}; ${ACCESS_COOKIE_NAME}=${access}`,
    "X-CSRF-Token": token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (args.user_agent != null) {
    headers["User-Agent"] = args.user_agent;
  }
  if (args.forwarded != null) {
    headers.Forwarded = args.forwarded;
  }
  return fetch(`${base_url}/api/v2/auth/change-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      current_password: "admin-change-me",
      new_password: STRONG_NEW,
      verify_new_password: STRONG_NEW,
      ...body,
    }),
  });
}

function extra_session(user_id: string) {
  return {
    id: OTHER_SESSION_ID,
    user_id,
    refresh_hmac: "other-session-hmac",
    session_expires_at: new Date(Date.now() + 7_200_000),
    refresh_expires_at: new Date(Date.now() + 3_600_000),
    ip_address: "203.0.113.50",
    user_agent: "other-device",
  };
}

describe("change-password user row lock", () => {
  it("selects the user FOR UPDATE before applying", () => {
    assert.match(SELECT_USER_FOR_UPDATE_SQL, /FOR UPDATE/);
    assert.match(SELECT_USER_FOR_UPDATE_SQL, /FROM "user"/);
  });
});

describe("must-change password change issues the first refresh", () => {
  it("sets a path-scoped refresh cookie, HMAC, idle Max-Age, and same JWT exp", async () => {
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
    const { server, base_url } = await listen(config);
    try {
      const login = await login_json(base_url);
      assert.equal(login.status, 200);
      const login_cookies = login.headers.getSetCookie();
      assert.equal(
        cookie_from_set_cookie(login_cookies, REFRESH_COOKIE_NAME),
        undefined,
      );
      const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const { payload: before } = await jwtVerify(access, config.public_key, {
        algorithms: ["ES256"],
      });
      assert.equal(before.password_change_required, true);
      assert.equal(sessions.rows.length, 1);
      const session_before = sessions.rows[0];
      assert.ok(session_before != null);
      assert.equal(session_before.refresh_hmac, null);
      const session_expires_at = session_before.session_expires_at.getTime();

      const response = await change_password(base_url, access, {}, {
        user_agent: "untangled-change-password",
        forwarded: "for=203.0.113.9;proto=https;host=localhost:8443",
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.ok, true);
      assert.equal("refresh_token" in body, false);
      assert.equal("access_token" in body, false);

      const set_cookies = response.headers.getSetCookie();
      const refresh_line = cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME);
      const access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
      assert.ok(refresh_line != null);
      assert.ok(access_line != null);
      assert.match(
        refresh_line,
        new RegExp(`Path=${REFRESH_COOKIE_PATH.replaceAll("/", "\\/")}`),
      );
      assert.equal(max_age(refresh_line), 3600);
      assert.equal(max_age(access_line), 3600);

      const refresh = cookie_value(set_cookies, REFRESH_COOKIE_NAME);
      const new_access = cookie_value(set_cookies, ACCESS_COOKIE_NAME);
      assert.ok(refresh != null);
      assert.ok(new_access != null);
      const { payload: after } = await jwtVerify(new_access, config.public_key, {
        algorithms: ["ES256"],
      });
      assert.equal(after.password_change_required, undefined);
      assert.equal(after.exp, before.exp);
      assert.equal(after.sid, before.sid);

      assert.equal(sessions.rows.length, 1);
      const session_after = sessions.rows[0];
      assert.ok(session_after != null);
      assert.equal(session_after.session_expires_at.getTime(), session_expires_at);
      assert.equal(
        session_after.refresh_hmac,
        hmac_refresh_token(config.refresh_hmac_secret, refresh),
      );
      assert.equal(session_after.ip_address, "203.0.113.9");
      assert.equal(session_after.user_agent, "untangled-change-password");
      assert.ok(
        session_after.refresh_expires_at.getTime() <
          session_after.session_expires_at.getTime(),
      );
    } finally {
      await close_server(server);
    }
  });

  it("does not mint refresh or delete sessions on a failed must-change", async () => {
    const sessions = memory_sessions();
    const users = memory_users([
      {
        ...TEST_ADMIN,
        password_expires_at: new Date(Date.now() - 60_000),
      },
    ]);
    await sessions.create(extra_session(TEST_USER_ID));
    const config = await test_config({ sessions, users });
    const { server, base_url } = await listen(config);
    try {
      const login = await login_json(base_url);
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const before_count = sessions.rows.length;
      const response = await change_password(base_url, access, {
        current_password: "wrong-password",
        invalidate_user_sessions: true,
      });
      assert.equal(response.status, 422);
      assert.equal(
        cookie_from_set_cookie(response.headers.getSetCookie(), REFRESH_COOKIE_NAME),
        undefined,
      );
      assert.equal(sessions.rows.length, before_count);
      const must_change = sessions.rows.find((row) => row.id !== OTHER_SESSION_ID);
      assert.equal(must_change?.refresh_hmac, null);
      assert.equal(
        sessions.rows.some((row) => row.id === OTHER_SESSION_ID),
        true,
      );
    } finally {
      await close_server(server);
    }
  });

  it("mints nothing and expires both cookies when invalidate_user_sessions is true", async () => {
    const sessions = memory_sessions();
    const users = memory_users([
      {
        ...TEST_ADMIN,
        password_expires_at: new Date(Date.now() - 60_000),
      },
    ]);
    await sessions.create(extra_session(TEST_USER_ID));
    const config = await test_config({ sessions, users });
    const { server, base_url } = await listen(config);
    try {
      const login = await login_json(base_url);
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(sessions.rows.length >= 2);
      const response = await change_password(base_url, access, {
        invalidate_user_sessions: true,
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal("refresh_token" in body, false);
      const set_cookies = response.headers.getSetCookie();
      const access_line = cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME);
      const refresh_line = cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME);
      assert.ok(access_line != null);
      assert.ok(refresh_line != null);
      assert.equal(max_age(access_line), 0);
      assert.equal(max_age(refresh_line), 0);
      assert.equal(cookie_value(set_cookies, REFRESH_COOKIE_NAME), "");
      assert.equal(sessions.rows.length, 0);
    } finally {
      await close_server(server);
    }
  });
});

describe("voluntary password change leaves tokens alone unless invalidate is set", () => {
  const sessions = memory_sessions();
  let server: Server;
  let base_url: string;
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
    hmac_secret = config.refresh_hmac_secret;
    ({ server, base_url } = await listen(config));
  });

  after(async () => {
    await close_server(server);
  });

  it("does not rotate refresh or set cookies when the flag is omitted", async () => {
    await sessions.create(extra_session(TEST_USER_ID));
    const login = await login_json(base_url);
    assert.equal(login.status, 200);
    const login_cookies = login.headers.getSetCookie();
    const access = cookie_value(login_cookies, ACCESS_COOKIE_NAME);
    const refresh = cookie_value(login_cookies, REFRESH_COOKIE_NAME);
    assert.ok(access != null);
    assert.ok(refresh != null);
    const hmac_before = hmac_refresh_token(hmac_secret, refresh);
    const before_count = sessions.rows.length;

    const response = await change_password(base_url, access, {});
    assert.equal(response.status, 200);
    const set_cookies = response.headers.getSetCookie();
    assert.equal(cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME), undefined);
    assert.equal(cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME), undefined);
    assert.equal(sessions.rows.length, before_count);
    const current = sessions.rows.find((row) => row.refresh_hmac === hmac_before);
    assert.ok(current != null);
    assert.equal(
      sessions.rows.some((row) => row.id === OTHER_SESSION_ID),
      true,
    );
  });
});

describe("voluntary password change with invalidate_user_sessions", () => {
  it("deletes every session for the user and expires both cookies", async () => {
    const sessions = memory_sessions();
    await sessions.create(extra_session(TEST_USER_ID));
    const config = await test_config({ sessions });
    const { server, base_url } = await listen(config);
    try {
      const login = await login_json(base_url);
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      assert.ok(sessions.rows.length >= 2);
      const response = await change_password(base_url, access, {
        invalidate_user_sessions: true,
      });
      assert.equal(response.status, 200);
      const set_cookies = response.headers.getSetCookie();
      assert.equal(max_age(cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME)!), 0);
      assert.equal(max_age(cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME)!), 0);
      assert.equal(sessions.rows.length, 0);
    } finally {
      await close_server(server);
    }
  });
});

describe("change-password hash-capacity 503", () => {
  it("returns distinct copy and does not mutate sessions", async () => {
    const sessions = memory_sessions();
    const limiter = make_hash_slot_limiter(() => 1);
    const config = await test_config({ sessions, hash_slots: limiter });
    const { server, base_url } = await listen(config);
    try {
      const login = await login_json(base_url);
      const access = cookie_value(login.headers.getSetCookie(), ACCESS_COOKIE_NAME);
      assert.ok(access != null);
      const before = sessions.rows.length;
      assert.equal(limiter.try_acquire(), true);
      const response = await change_password(base_url, access, {});
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        detail: "Password change is temporarily busy. Try again in a moment.",
      });
      assert.equal(sessions.rows.length, before);
    } finally {
      await close_server(server);
    }
  });
});
