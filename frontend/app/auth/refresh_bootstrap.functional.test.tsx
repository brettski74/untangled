/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshBootstrap } from "./refresh_bootstrap";

describe("RefreshBootstrap", () => {
  const replace = vi.fn();
  const assign = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    assign.mockReset();
    vi.stubGlobal("location", {
      assign,
      replace,
      pathname: "/change_request/lists/all",
      search: "",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a blank page and replaces after successful refresh", async () => {
    const fetch_mock = vi.fn(async (input: RequestInfo, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v2/auth/csrf")) {
        return Response.json({ csrf_token: "csrf-from-fetch" });
      }
      if (url.includes("/api/v2/auth/refresh")) {
        return Response.json({ ok: true }, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetch_mock);

    const { container } = render(<RefreshBootstrap />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/change_request/lists/all");
    });
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.textContent).toBe("");
    expect(String(fetch_mock.mock.calls[0]?.[0])).toBe("/api/v2/auth/csrf");
    expect(String(fetch_mock.mock.calls[1]?.[0])).toBe("/api/v2/auth/refresh");
    expect(fetch_mock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(assign).not.toHaveBeenCalled();
  });
});
