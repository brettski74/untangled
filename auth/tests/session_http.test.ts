import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { jwtVerify } from "jose";

import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  parse_cookie_header,
} from "../src/cookies.js";
import { create_server } from "../src/server.js";
import { PUBLIC_ORIGIN, TEST_USER_ID, test_config } from "./helpers.js";

const STRONG_NEW = "orchid-lantern-quasar-7N!pQ2xm";

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

describe("auth me + change-password", () => {
  let server: Server;
  let base_url: string;
  let public_key: CryptoKey;

  before(async () => {
    const config = await test_config();
    public_key = config.public_key;
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
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    const token = (body as { csrf_token: string }).csrf_token;
    return { token, cookie: `${CSRF_COOKIE_NAME}=${token}` };
  }

  async function login_access(): Promise<string> {
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
    const value = cookie_value(response.headers.getSetCookie(), ACCESS_COOKIE_NAME);
    assert.ok(value != null);
    return value;
  }

  it("GET /me returns 401 without a token", async () => {
    const response = await fetch(`${base_url}/api/v2/auth/me`);
    assert.equal(response.status, 401);
  });

  it("GET /me returns profile for a Bearer token", async () => {
    const access = await login_access();
    const response = await fetch(`${base_url}/api/v2/auth/me`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      username: string;
      display_name: string;
      roles: string[];
      permissions: string[];
    };
    assert.equal(body.username, "admin");
    assert.equal(body.display_name, "Admin");
    assert.deepEqual(body.roles, ["admin"]);
    assert.ok(body.permissions.includes("admin"));
  });

  it("change-password rejects a wrong current password without leaking why", async () => {
    const access = await login_access();
    const { token, cookie } = await issue_csrf();
    const response = await fetch(`${base_url}/api/v2/auth/change-password`, {
      method: "POST",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: `${cookie}; ${ACCESS_COOKIE_NAME}=${access}`,
        "X-CSRF-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        current_password: "wrong-password",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      }),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      detail: "Password change failed.",
    });
  });

  it("change-password requires Origin/CSRF and does not reissue tokens on a normal session", async () => {
    const access = await login_access();
    const { token, cookie } = await issue_csrf();
    const denied = await fetch(`${base_url}/api/v2/auth/change-password`, {
      method: "POST",
      headers: {
        Cookie: `${cookie}; ${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        current_password: "admin-change-me",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      }),
    });
    assert.equal(denied.status, 403);

    const ok = await fetch(`${base_url}/api/v2/auth/change-password`, {
      method: "POST",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: `${cookie}; ${ACCESS_COOKIE_NAME}=${access}`,
        "X-CSRF-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        current_password: "admin-change-me",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      }),
    });
    assert.equal(ok.status, 200);
    const payload = (await ok.json()) as { ok: boolean; detail: string };
    assert.equal(payload.ok, true);
    assert.equal("access_token" in payload, false);
    assert.equal("refresh_token" in payload, false);
    const set_cookies = ok.headers.getSetCookie();
    assert.equal(cookie_from_set_cookie(set_cookies, ACCESS_COOKIE_NAME), undefined);
    assert.equal(
      cookie_from_set_cookie(set_cookies, REFRESH_COOKIE_NAME),
      undefined,
    );
    const { payload: jwt_payload } = await jwtVerify(access, public_key, {
      algorithms: ["ES256"],
    });
    assert.equal(jwt_payload.sub, TEST_USER_ID);
    assert.equal(typeof jwt_payload.sid, "string");
    assert.equal(jwt_payload.password_change_required, undefined);
  });
});
