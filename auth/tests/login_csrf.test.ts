import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { jwtVerify } from "jose";

import type { AuditEvent } from "../src/audit.js";
import {
  AUTH_CSRF_DENIED,
  CSRF_DENIED_CSRF,
  CSRF_DENIED_ORIGIN,
} from "../src/audit.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parse_cookie_header,
} from "../src/cookies.js";
import { USERNAME_EVENT_BOUND } from "../src/login_settings.js";
import { create_server } from "../src/server.js";
import { PUBLIC_ORIGIN, TEST_USER_ID, test_config } from "./helpers.js";

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

describe("auth csrf + login", () => {
  let server: Server;
  let base_url: string;
  let public_key: CryptoKey;
  const audit_events: AuditEvent[] = [];

  before(async () => {
    const config = await test_config({ audit_events });
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
    assert.ok(body !== null && typeof body === "object");
    const token = (body as { csrf_token: unknown }).csrf_token;
    assert.equal(typeof token, "string");
    assert.ok((token as string).length >= 32);
    const set_cookies = response.headers.getSetCookie();
    const line = cookie_from_set_cookie(set_cookies, CSRF_COOKIE_NAME);
    assert.ok(line != null, "csrf Set-Cookie missing");
    assert.match(line, /Path=\//);
    assert.match(line, /SameSite=Lax/i);
    assert.match(line, /Secure/i);
    assert.doesNotMatch(line, /HttpOnly/i);
    assert.equal(cookie_value(set_cookies, CSRF_COOKIE_NAME), token);
    return { token: token as string, cookie: `${CSRF_COOKIE_NAME}=${token}` };
  }

  function last_event(): AuditEvent {
    const event = audit_events[audit_events.length - 1];
    assert.ok(event != null, "expected an audit event");
    return event;
  }

  function assert_no_secrets(event: AuditEvent, ...secrets: string[]): void {
    const payload = JSON.stringify(event);
    for (const secret of secrets) {
      if (secret !== "") {
        assert.equal(payload.includes(secret), false);
      }
    }
    assert.equal(payload.includes("admin-change-me"), false);
  }

  it("issues a fresh CSPRNG csrf token each call", async () => {
    const first = await issue_csrf();
    const second = await issue_csrf();
    assert.notEqual(first.token, second.token);
    assert.equal(audit_events.length, 0);
  });

  it("rejects login without Origin", async () => {
    const { token, cookie } = await issue_csrf();
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "X-CSRF-Token": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "username=admin&password=admin-change-me",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { detail: "Forbidden" });
    assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME), undefined);
    const event = last_event();
    assert.equal(event.event_type, AUTH_CSRF_DENIED);
    assert.equal(event.reason, CSRF_DENIED_ORIGIN);
    assert.equal(event.user_id, null);
    assert.equal(event.data.username_provided, undefined);
    assert.equal(event.data.origin, "");
    assert.equal(event.data.method, "POST");
    assert.equal(event.data.context_path, "/api/v2/auth/login");
    assert.equal(event.data.csrf_header_length, token.length);
    assert.equal(event.data.csrf_cookie_length, token.length);
    assert.ok(typeof event.data.user_agent === "string");
    assert_no_secrets(event, token);
  });

  it("rejects login with a different origin (localhost vs 127.0.0.1)", async () => {
    const { token, cookie } = await issue_csrf();
    const origin = "https://127.0.0.1:8443";
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "username=admin&password=admin-change-me",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { detail: "Forbidden" });
    assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME), undefined);
    const event = last_event();
    assert.equal(event.event_type, AUTH_CSRF_DENIED);
    assert.equal(event.reason, CSRF_DENIED_ORIGIN);
    assert.equal(event.user_id, null);
    assert.equal(event.data.username_provided, undefined);
    assert.equal(event.data.origin, origin);
    assert.equal(event.data.csrf_header_length, token.length);
    assert.equal(event.data.csrf_cookie_length, token.length);
    assert_no_secrets(event, token);
  });

  it("bounds attacker Origin text in the csrf denied event", async () => {
    const origin = `https://${"a".repeat(300)}.evil:8443`;
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "username=admin&password=admin-change-me",
    });
    assert.equal(response.status, 403);
    const event = last_event();
    assert.equal(event.event_type, AUTH_CSRF_DENIED);
    assert.equal(event.reason, CSRF_DENIED_ORIGIN);
    assert.equal((event.data.origin as string).length, USERNAME_EVENT_BOUND);
    assert.equal(event.data.origin, origin.slice(0, USERNAME_EVENT_BOUND));
    assert.equal(event.data.csrf_header_length, 0);
    assert.equal(event.data.csrf_cookie_length, 0);
  });

  it("rejects login with missing csrf", async () => {
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Origin: PUBLIC_ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "username=admin&password=admin-change-me",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { detail: "Forbidden" });
    assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME), undefined);
    const event = last_event();
    assert.equal(event.event_type, AUTH_CSRF_DENIED);
    assert.equal(event.reason, CSRF_DENIED_CSRF);
    assert.equal(event.user_id, null);
    assert.equal(event.data.username_provided, "admin");
    assert.equal(event.data.origin, PUBLIC_ORIGIN);
    assert.equal(event.data.csrf_header_length, 0);
    assert.equal(event.data.csrf_cookie_length, 0);
    assert_no_secrets(event);
  });

  it("rejects login with wrong csrf", async () => {
    const { cookie, token } = await issue_csrf();
    const other = await issue_csrf();
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: cookie,
        "X-CSRF-Token": other.token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "username=admin&password=admin-change-me",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { detail: "Forbidden" });
    assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME), undefined);
    const event = last_event();
    assert.equal(event.event_type, AUTH_CSRF_DENIED);
    assert.equal(event.reason, CSRF_DENIED_CSRF);
    assert.equal(event.user_id, null);
    assert.equal(event.data.username_provided, "admin");
    assert.equal(event.data.csrf_header_length, other.token.length);
    assert.equal(event.data.csrf_cookie_length, token.length);
    assert_no_secrets(event, token, other.token);
  });

  it("rejects invalid credentials with 401 and no access cookie", async () => {
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
      body: "username=admin&password=wrong-password",
    });
    assert.equal(response.status, 401);
    const body: unknown = await response.json();
    assert.deepEqual(body, { detail: "Access denied" });
    assert.equal(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME), undefined);
  });

  it("accepts matching Origin and header csrf and sets an ES256 access cookie", async () => {
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
    assert.deepEqual(await response.json(), { ok: true });
    const line = cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME);
    assert.ok(line != null);
    assert.match(line, /HttpOnly/i);
    assert.match(line, /Secure/i);
    assert.match(line, /SameSite=Lax/i);
    assert.match(line, /Path=\//);
    assert.match(line, /Max-Age=/i);
    assert.doesNotMatch(line, /Domain=/i);
    const value = cookie_value(response.headers.getSetCookie(), ACCESS_COOKIE_NAME);
    assert.ok(value != null);
    const { payload } = await jwtVerify(value, public_key, { algorithms: ["ES256"] });
    assert.equal(payload.sub, TEST_USER_ID);
    assert.equal(payload.typ, "access");
    assert.equal(payload.password_change_required, undefined);
    assert.equal(typeof payload.iat, "number");
    assert.equal(typeof payload.exp, "number");
  });

  it("accepts matching Origin and form csrf_token", async () => {
    const { token, cookie } = await issue_csrf();
    const body = new URLSearchParams({
      csrf_token: token,
      username: "admin",
      password: "admin-change-me",
    });
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: cookie,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    assert.equal(response.status, 200);
    assert.ok(cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME) != null);
  });

  it("redirects form posts without JSON Accept to a safe next path", async () => {
    const { token, cookie } = await issue_csrf();
    const body = new URLSearchParams({
      csrf_token: token,
      username: "admin",
      password: "admin-change-me",
      next: "/incident/lists/all",
    });
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/incident/lists/all");
  });

  it("rejects open-redirect next values", async () => {
    const { token, cookie } = await issue_csrf();
    const body = new URLSearchParams({
      csrf_token: token,
      username: "admin",
      password: "admin-change-me",
      next: "https://evil.example/phish",
    });
    const response = await fetch(`${base_url}/api/v2/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: PUBLIC_ORIGIN,
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/");
  });
});

describe("auth csrf denied audit fail-closed", () => {
  it("returns 500 when csrf denied emit fails and does not set an access cookie", async () => {
    const config = await test_config({
      audit: {
        async emit() {
          throw new Error("injected csrf audit failure");
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
      const response = await fetch(`${base_url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          Origin: "https://localhost.evil:8443",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "username=admin&password=admin-change-me",
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { detail: "Internal error" });
      assert.equal(
        cookie_from_set_cookie(response.headers.getSetCookie(), ACCESS_COOKIE_NAME),
        undefined,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
