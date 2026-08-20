/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CSRF_COOKIE_NAME } from "./cookie_names";
import {
  authenticated_fetch,
  body_allows_refresh,
  session_max_refresh_retries_from_config,
} from "./refresh_fetch";

describe("session_max_refresh_retries_from_config", () => {
  it("accepts 1–10 integers and defaults otherwise", () => {
    expect(session_max_refresh_retries_from_config(5)).toBe(5);
    expect(session_max_refresh_retries_from_config(1)).toBe(1);
    expect(session_max_refresh_retries_from_config(10)).toBe(10);
    expect(session_max_refresh_retries_from_config(0)).toBe(5);
    expect(session_max_refresh_retries_from_config(11)).toBe(5);
    expect(session_max_refresh_retries_from_config("5")).toBe(5);
  });
});

describe("body_allows_refresh", () => {
  it("requires retry true", () => {
    expect(body_allows_refresh({ detail: "Could not validate credentials", retry: true })).toBe(
      true,
    );
    expect(body_allows_refresh({ detail: "Could not validate credentials" })).toBe(false);
    expect(body_allows_refresh({ retry: false })).toBe(false);
  });
});

describe("authenticated_fetch", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", {
      assign,
      pathname: "/change-password",
      search: "",
    });
    Object.defineProperty(document, "cookie", {
      configurable: true,
      writable: true,
      value: `${CSRF_COOKIE_NAME}=csrf-from-cookie`,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs same-origin refresh then retries the original request on expiry 401", async () => {
    let original_calls = 0;
    const fetch_mock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/v2/auth/csrf")) {
        return Response.json({ csrf_token: "csrf-from-fetch" });
      }
      if (url.includes("/api/v2/auth/refresh")) {
        return Response.json({ ok: true }, { status: 200 });
      }
      original_calls += 1;
      if (original_calls === 1) {
        return Response.json(
          { detail: "Could not validate credentials", retry: true },
          { status: 401 },
        );
      }
      return Response.json({ ok: true, detail: "done" }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/auth/change-password", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, detail: "done" });
    expect(fetch_mock).toHaveBeenCalledTimes(4);
    expect(String(fetch_mock.mock.calls[1]?.[0])).toBe("/api/v2/auth/csrf");
    expect(String(fetch_mock.mock.calls[2]?.[0])).toBe("/api/v2/auth/refresh");
    expect(fetch_mock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    const refresh_headers = new Headers(fetch_mock.mock.calls[2]?.[1]?.headers);
    expect(refresh_headers.get("X-CSRF-Token")).toBe("csrf-from-fetch");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not refresh on 403", async () => {
    const fetch_mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ detail: "Forbidden" }, { status: 403 }));
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/incident/x", {
      method: "POST",
    });
    expect(response.status).toBe(403);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends the operator to login on a non-retry 401", async () => {
    const fetch_mock = vi.fn().mockResolvedValueOnce(
      Response.json({ detail: "Could not validate credentials" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/auth/change-password");
    expect(response.status).toBe(401);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fchange-password");
  });

  it("retries soft refresh 401s up to max_retries then goes to login", async () => {
    const fetch_mock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/v2/auth/csrf")) {
        return Response.json({ csrf_token: "csrf-from-fetch" });
      }
      if (url.includes("/api/v2/auth/refresh")) {
        return Response.json(
          { detail: "Access denied", retry: true, max_retries: 2 },
          { status: 401 },
        );
      }
      return Response.json(
        { detail: "Could not validate credentials", retry: true },
        { status: 401 },
      );
    });
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/auth/change-password");
    expect(response.status).toBe(401);
    const refresh_calls = fetch_mock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v2/auth/refresh"),
    );
    expect(refresh_calls).toHaveLength(2);
    expect(assign).toHaveBeenCalled();
  });

  it("defaults omitted max_retries to five refresh POSTs", async () => {
    const fetch_mock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/v2/auth/csrf")) {
        return Response.json({ csrf_token: "csrf-from-fetch" });
      }
      if (url.includes("/api/v2/auth/refresh")) {
        return Response.json(
          { detail: "Access denied", retry: true },
          { status: 401 },
        );
      }
      return Response.json(
        { detail: "Could not validate credentials", retry: true },
        { status: 401 },
      );
    });
    vi.stubGlobal("fetch", fetch_mock);

    await authenticated_fetch("/api/v2/auth/change-password");
    const refresh_calls = fetch_mock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v2/auth/refresh"),
    );
    expect(refresh_calls).toHaveLength(5);
    expect(assign).toHaveBeenCalled();
  });

  it("goes to login on a hard refresh 401", async () => {
    const fetch_mock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/v2/auth/csrf")) {
        return Response.json({ csrf_token: "csrf-from-fetch" });
      }
      if (url.includes("/api/v2/auth/refresh")) {
        return Response.json({ detail: "Access denied" }, { status: 401 });
      }
      return Response.json(
        { detail: "Could not validate credentials", retry: true },
        { status: 401 },
      );
    });
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/auth/change-password");
    expect(response.status).toBe(401);
    expect(String(fetch_mock.mock.calls[2]?.[0])).toBe("/api/v2/auth/refresh");
    expect(assign).toHaveBeenCalled();
  });

  it("does not wrap POST /api/v2/auth/refresh itself", async () => {
    const fetch_mock = vi.fn().mockResolvedValueOnce(
      Response.json(
        { detail: "Could not validate credentials", retry: true },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetch_mock);

    const response = await authenticated_fetch("/api/v2/auth/refresh", {
      method: "POST",
    });
    expect(response.status).toBe(401);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
