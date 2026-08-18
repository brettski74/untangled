import { beforeEach, describe, expect, it, vi } from "vitest";

import { action as logout_action, loader as logout_loader } from "../routes/logout";
import { reset_access_verifier_for_tests } from "./session.server";
import { fake_access_token, install_test_jwt_keys } from "./test_tokens";

async function access_cookie_header(token = fake_access_token()): Promise<string> {
  const { commit_access_token } = await import("./session.server");
  const set_cookie = await commit_access_token(
    new Request("http://web.test/"),
    token,
  );
  return `${set_cookie.split(";")[0]}; __untangled_csrf=csrf-test`;
}

describe("SSR /logout (#234)", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    vi.restoreAllMocks();
  });

  it("GET does not call auth or expire cookies", async () => {
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_loader({
      request: new Request("http://web.test/logout"),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(405);
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("POST cross-site Fetch-metadata is 403 without calling auth", async () => {
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: await access_cookie_header(),
          Origin: "http://web.test",
          "Sec-Fetch-Site": "cross-site",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Forbidden" });
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("POST without Sec-Fetch-Site may proceed to auth", async () => {
    const fetch_mock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: await access_cookie_header(),
          Origin: "http://web.test",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(302);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
  });

  it("POST auth 403 keeps cookies", async () => {
    const fetch_mock = vi.fn(
      async () => Response.json({ detail: "Forbidden" }, { status: 403 }),
    );
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: await access_cookie_header(),
          Origin: "http://evil.test",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("POST auth unreachable is 503 and keeps cookies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("auth down");
    }));
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: await access_cookie_header(),
          Origin: "http://web.test",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("POST auth 401 expires both cookies and redirects to login", async () => {
    const fetch_mock = vi.fn(
      async () => Response.json({ detail: "Access denied" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: await access_cookie_header(),
          Origin: "http://web.test",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((line) => /__untangled_access/.test(line) && /Max-Age=0/i.test(line))).toBe(
      true,
    );
    expect(
      cookies.some(
        (line) =>
          /__untangled_refresh/.test(line) &&
          /Path=\/api\/v2\/auth\/refresh/.test(line) &&
          /HttpOnly/i.test(line) &&
          /SameSite=Lax/i.test(line) &&
          !/Domain=/i.test(line),
      ),
    ).toBe(true);
  });

  it("does not forward the refresh cookie to auth", async () => {
    const fetch_mock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch_mock);
    await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: `${await access_cookie_header()}; __untangled_refresh=should-not-forward`,
          Origin: "http://web.test",
        },
        body: new URLSearchParams({ csrf_token: "csrf-test" }),
      }),
      params: {},
      context: {},
    } as never);
    const init = fetch_mock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Cookie")).toBe("__untangled_csrf=csrf-test");
    expect(headers.get("Cookie") ?? "").not.toMatch(/__untangled_refresh/);
    expect(headers.get("Cookie") ?? "").not.toMatch(/__untangled_access/);
  });
});
