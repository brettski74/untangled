import { beforeEach, describe, expect, it, vi } from "vitest";

import { public_route_ids } from "../routes";
import { action as login_action, loader as login_loader } from "../routes/login";
import { loader as authenticated_loader } from "../routes/authenticated";
import { action as logout_action } from "../routes/logout";
import { reset_session_storage_for_tests } from "./session.server";
import { fake_access_token } from "./test_tokens";

describe("route wiring", () => {
  beforeEach(() => {
    process.env.UNTANGLED_SESSION_SECRET = "test-only-session-secret-not-for-prod";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    reset_session_storage_for_tests();
    vi.restoreAllMocks();
  });

  it("keeps only login/logout as public route ids", () => {
    expect([...public_route_ids]).toEqual(["routes/login", "routes/logout"]);
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

  it("authenticated loader returns profile when session + /auth/me succeed", async () => {
    const token = fake_access_token();
    const { commit_access_token } = await import("./session.server");
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      token,
    );

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
      request: new Request("http://web.test/change-requests/lists/all", {
        headers: { Cookie: set_cookie.split(";")[0] ?? set_cookie },
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
      ["change-request", "incident"],
    );
    expect(result.init?.headers).toMatchObject({
      "Cache-Control": "private, no-store",
    });
  });

  it("authenticated loader redirects / to Change Requests → All for admin", async () => {
    const token = fake_access_token();
    const { commit_access_token } = await import("./session.server");
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      token,
    );

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
      await authenticated_loader({
        request: new Request("http://web.test/", {
          headers: { Cookie: set_cookie.split(";")[0] ?? set_cookie },
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
        "/change-requests/lists/all",
      );
    }
  });

  it("login action commits a session cookie on success", async () => {
    const token = fake_access_token();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: token,
          refresh_token: "discard-me",
          token_type: "bearer",
        }),
      ),
    );

    const body = new URLSearchParams({
      username: "admin",
      password: "admin-change-me",
      next: "/",
    });
    const response = (await login_action({
      request: new Request("http://web.test/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.get("Set-Cookie")).toContain("__untangled_session");
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

  it("logout action clears the session cookie", async () => {
    const { commit_access_token } = await import("./session.server");
    const set_cookie = await commit_access_token(
      new Request("http://web.test/"),
      fake_access_token(),
    );
    const response = await logout_action({
      request: new Request("http://web.test/logout", {
        method: "POST",
        headers: { Cookie: set_cookie.split(";")[0] ?? set_cookie },
      }),
      params: {},
      context: {},
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie") ?? "").toMatch(
      /Max-Age=0|max-age=0|Expires=/i,
    );
  });
});
