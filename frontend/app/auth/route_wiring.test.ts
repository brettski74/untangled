import { beforeEach, describe, expect, it, vi } from "vitest";

import { public_route_ids } from "../routes";
import { loader as login_loader } from "../routes/login";
import { loader as authenticated_loader } from "../routes/authenticated";
import { loader as home_loader } from "../routes/home";
import { action as logout_action, loader as logout_loader } from "../routes/logout";
import { reset_access_verifier_for_tests } from "./session.server";
import { fake_access_token, install_test_jwt_keys } from "./test_tokens";

const READWRITE_PERMISSIONS = [
  "incident:create",
  "incident:read",
  "incident:update",
  "change_request:create",
  "change_request:read",
  "change_request:update",
  "demo_item:create",
  "demo_item:read",
  "demo_item:update",
];

async function session_cookie(token = fake_access_token()): Promise<string> {
  const { commit_access_token } = await import("./session.server");
  const set_cookie = await commit_access_token(
    new Request("http://web.test/"),
    token,
  );
  return set_cookie.split(";")[0] ?? set_cookie;
}

describe("route wiring", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    vi.restoreAllMocks();
  });

  it("keeps login, logout, and expired-password as public route ids", () => {
    expect([...public_route_ids]).toEqual([
      "routes/login",
      "routes/logout",
      "routes/expired_password",
    ]);
  });

  it("authenticated loader redirects must-change sessions to expired-password", async () => {
    const cookie = await session_cookie(
      fake_access_token(900, { password_change_required: true }),
    );
    try {
      await authenticated_loader({
        request: new Request("http://web.test/change_request/lists/all", {
          headers: { Cookie: cookie },
        }),
        params: {},
        context: {},
      } as never);
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/expired-password");
    }
  });

  it("authenticated loader redirects when there is no session", async () => {
    await expect(
      authenticated_loader({
        request: new Request("http://web.test/"),
        params: {},
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 302 });
  });

  it("authenticated loader returns profile when session + /api/v2/auth/me succeed", async () => {
    const cookie = await session_cookie();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          username: "admin",
          display_name: "Admin",
          roles: ["admin"],
          permissions: ["admin"],
        }),
      ),
    );

    const result = await authenticated_loader({
      request: new Request("http://web.test/change_request/lists/all", {
        headers: { Cookie: cookie },
      }),
      params: {},
      context: {},
    } as never);

    expect(result).toMatchObject({
      data: {
        me: {
          username: "admin",
          display_name: "Admin",
          permissions: ["admin"],
        },
      },
    });
    expect(result.data.nav?.map((s: { class_name: string }) => s.class_name)).toEqual(
      ["change_request", "incident", "system_config"],
    );
    expect(result.init?.headers).toMatchObject({
      "Cache-Control": "private, no-store",
    });
  });

  it("authenticated layout does not redirect on / or /_.data (index owns landing)", async () => {
    const cookie = await session_cookie();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          username: "admin",
          display_name: "Admin",
          roles: ["admin"],
          permissions: ["admin"],
        }),
      ),
    );

    for (const url of ["http://web.test/", "http://web.test/_.data"]) {
      const result = await authenticated_loader({
        request: new Request(url, { headers: { Cookie: cookie } }),
        params: {},
        context: {},
      } as never);
      expect(result).toMatchObject({
        data: { me: { username: "admin" } },
      });
      expect(result).not.toBeInstanceOf(Response);
    }
  });

  it("home loader redirects to Change Requests → All for admin", async () => {
    const cookie = await session_cookie();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          username: "admin",
          display_name: "Admin",
          roles: ["admin"],
          permissions: ["admin"],
        }),
      ),
    );

    try {
      await home_loader({
        request: new Request("http://web.test/_.data", {
          headers: { Cookie: cookie },
        }),
        params: {},
        context: {},
      } as never);
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/change_request/lists/all",
      );
    }
  });

  it("home loader redirects to Change Requests → All for readwrite", async () => {
    const cookie = await session_cookie();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          username: "readwrite",
          display_name: "Read Write",
          roles: ["readwrite"],
          permissions: READWRITE_PERMISSIONS,
        }),
      ),
    );

    try {
      await home_loader({
        request: new Request("http://web.test/", {
          headers: { Cookie: cookie },
        }),
        params: {},
        context: {},
      } as never);
      expect.unreachable("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/change_request/lists/all",
      );
    }
  });

  it("home loader returns null when no destinations are visible", async () => {
    const cookie = await session_cookie();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          username: "empty",
          display_name: "Empty",
          roles: [],
          permissions: [],
        }),
      ),
    );

    await expect(
      home_loader({
        request: new Request("http://web.test/", {
          headers: { Cookie: cookie },
        }),
        params: {},
        context: {},
      } as never),
    ).resolves.toBeNull();
  });

  it("login loader redirects away when already authenticated", async () => {
    const { commit_access_token } = await import("./session.server");
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      fake_access_token(),
    );
    await expect(
      login_loader({
        request: new Request("http://web.test/login", {
          headers: { Cookie: set_cookie.split(";")[0] ?? set_cookie },
        }),
        params: {},
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 302 });
  });

  it("logout GET is 405 with no session work", async () => {
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_loader();
    expect(response.status).toBe(405);
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("logout action expires both cookies after auth success", async () => {
    const { commit_access_token } = await import("./session.server");
    const token = fake_access_token();
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      token,
    );
    const fetch_mock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch_mock);
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: {
          Cookie: `${set_cookie.split(";")[0]}; __untangled_csrf=csrf-test`,
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
          /Max-Age=0/i.test(line) &&
          /Path=\/api\/v2\/auth\/refresh/.test(line),
      ),
    ).toBe(true);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    const call = fetch_mock.mock.calls[0] as unknown as [unknown, RequestInit];
    const headers = new Headers(call[1].headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("Origin")).toBe("http://web.test");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-test");
    expect(headers.get("Cookie")).toBe("__untangled_csrf=csrf-test");
    expect(headers.get("Cookie") ?? "").not.toMatch(/__untangled_refresh/);
  });
});
