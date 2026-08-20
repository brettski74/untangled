import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  access_token_remaining_seconds,
  assert_web_auth_config,
  cookie_secure_from_env,
} from "./config.server";
import { api_fetch_with_token, session_action_for_status } from "./api.server";
import { ApiForbiddenError, ApiUnauthorizedError } from "./errors";
import {
  DOCUMENT_BOOTSTRAP,
  redirect_unauthenticated,
  redirect_unauthorized,
  require_document_access,
} from "./gate.server";
import {
  ACCESS_COOKIE_NAME,
  commit_access_token,
  get_access_token,
  reset_access_verifier_for_tests,
} from "./session.server";

import { fake_access_token, install_test_jwt_keys } from "./test_tokens";

describe("auth gate + session", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    reset_access_verifier_for_tests();
  });

  it("assert_web_auth_config requires public key, API base, and auth base", () => {
    expect(() => assert_web_auth_config()).not.toThrow();
    delete process.env.UNTANGLED_JWT_PUBLIC_KEY;
    expect(() => assert_web_auth_config()).toThrow(/UNTANGLED_JWT_PUBLIC_KEY/);
    install_test_jwt_keys();
    delete process.env.UNTANGLED_API_BASE_URL;
    expect(() => assert_web_auth_config()).toThrow(/UNTANGLED_API_BASE_URL/);
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    delete process.env.UNTANGLED_AUTH_BASE_URL;
    expect(() => assert_web_auth_config()).toThrow(/UNTANGLED_AUTH_BASE_URL/);
  });

  it("cookie_secure_from_env defaults to secure and rejects typos", () => {
    delete process.env.UNTANGLED_COOKIE_SECURE;
    expect(cookie_secure_from_env()).toBe(true);
    expect(cookie_secure_from_env("")).toBe(true);
    expect(cookie_secure_from_env("false")).toBe(false);
    expect(cookie_secure_from_env("FALSE")).toBe(false);
    expect(cookie_secure_from_env("true")).toBe(true);
    expect(() => cookie_secure_from_env("yes")).toThrow(/UNTANGLED_COOKIE_SECURE/);
  });

  it("access_token_remaining_seconds reads exp", () => {
    const token = fake_access_token(600);
    const remaining = access_token_remaining_seconds(token);
    expect(remaining).toBeGreaterThan(500);
    expect(remaining).toBeLessThanOrEqual(600);
  });

  it("redirects unauthenticated requests to login with next", () => {
    const request = new Request("http://web.test/protected?x=1");
    const response = redirect_unauthenticated(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/login?next=%2Fprotected%3Fx%3D1",
    );
  });

  it("require_document_access returns bootstrap on expired GET and login otherwise", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = fake_access_token(60, { iat: now - 120, exp: now - 10 });
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      expired,
    );
    const cookie = cookie_header_from_set_cookie(set_cookie);
    const get_request = new Request("http://web.test/incident/lists/all", {
      headers: { Cookie: cookie },
    });
    expect(await require_document_access(get_request)).toBe(DOCUMENT_BOOTSTRAP);
    expect(await get_access_token(get_request)).toBeNull();

    const post_request = new Request("http://web.test/incident/lists/all", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    await expect(require_document_access(post_request)).rejects.toMatchObject({
      status: 302,
    });

    const must_change = fake_access_token(60, {
      iat: now - 120,
      exp: now - 10,
      password_change_required: true,
    });
    const must_cookie = cookie_header_from_set_cookie(
      await commit_access_token(new Request("http://web.test/"), must_change),
    );
    try {
      await require_document_access(
        new Request("http://web.test/", { headers: { Cookie: must_cookie } }),
      );
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
      expect((error as Response).headers.get("Location")).toBe("/login");
    }
  });

  it("stores access_token in the access cookie and reads it back", async () => {
    const request = new Request("http://web.test/");
    const token = fake_access_token();
    const set_cookie = await commit_access_token(request, token);
    expect(set_cookie).toContain(ACCESS_COOKIE_NAME);
    expect(set_cookie.toLowerCase()).toContain("httponly");
    expect(set_cookie).toMatch(/Max-Age=9\d{2}/i);

    const authed = new Request("http://web.test/", {
      headers: { Cookie: cookie_header_from_set_cookie(set_cookie) },
    });
    expect(await get_access_token(authed)).toBe(token);
  });

  it("clears the access cookie on unauthorized redirect", async () => {
    const primed = new Request("http://web.test/");
    const set_cookie = await commit_access_token(primed, fake_access_token());
    const request = new Request("http://web.test/home", {
      headers: { Cookie: cookie_header_from_set_cookie(set_cookie) },
    });

    const response = await redirect_unauthorized(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?next=%2Fhome");
    const cleared = response.headers.get("Set-Cookie") ?? "";
    expect(cleared).toContain(ACCESS_COOKIE_NAME);
    expect(cleared).toMatch(/Max-Age=0|max-age=0|Expires=/i);
  });

  it("api_fetch_with_token throws unauthorized on 401 and forbidden on 403", async () => {
    const fetch_mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(api_fetch_with_token("t", "/api/v2/incident/x")).rejects.toBeInstanceOf(
      ApiUnauthorizedError,
    );
    await expect(api_fetch_with_token("t", "/api/v2/incident/x")).rejects.toBeInstanceOf(
      ApiForbiddenError,
    );
    expect(session_action_for_status(401)).toBe("clear_session");
    expect(session_action_for_status(403)).toBe("preserve_session");
  });

  it("does not POST refresh when the API 401 body has retry true", async () => {
    const fetch_mock = vi.fn().mockResolvedValue(
      Response.json(
        { detail: "Could not validate credentials", retry: true },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetch_mock);

    await expect(api_fetch_with_token("t", "/api/v2/incident/x")).rejects.toBeInstanceOf(
      ApiUnauthorizedError,
    );
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(String(fetch_mock.mock.calls[0]?.[0])).toContain("/api/v2/incident/x");
  });

  it("refuses to verify without UNTANGLED_JWT_PUBLIC_KEY", async () => {
    delete process.env.UNTANGLED_JWT_PUBLIC_KEY;
    reset_access_verifier_for_tests();
    const request = new Request("http://web.test/", {
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=not-a-real-token` },
    });
    await expect(get_access_token(request)).rejects.toThrow(
      /UNTANGLED_JWT_PUBLIC_KEY/,
    );
  });
});

function cookie_header_from_set_cookie(set_cookie: string): string {
  return set_cookie.split(";")[0] ?? set_cookie;
}
