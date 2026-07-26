import { describe, expect, it } from "vitest";

import { session_action_for_status } from "./api.server";
import { safe_next_path } from "./next_path";
import { token_pair_schema, user_profile_schema } from "./schemas";
import { login_redirect_url } from "./gate.server";

describe("safe_next_path", () => {
  it("allows same-origin relative paths", () => {
    expect(safe_next_path("/")).toBe("/");
    expect(safe_next_path("/incidents")).toBe("/incidents");
    expect(safe_next_path("/a?b=1")).toBe("/a?b=1");
  });

  it("rejects open redirects", () => {
    expect(safe_next_path("//evil.example")).toBe("/");
    expect(safe_next_path("https://evil.example")).toBe("/");
    expect(safe_next_path("http://evil.example/x")).toBe("/");
    expect(safe_next_path(null)).toBe("/");
    expect(safe_next_path("")).toBe("/");
  });
});

describe("login_redirect_url", () => {
  it("omits next when destination is home", () => {
    expect(login_redirect_url("/")).toBe("/login");
    expect(login_redirect_url(null)).toBe("/login");
  });

  it("preserves a safe next destination", () => {
    expect(login_redirect_url("/stub")).toBe("/login?next=%2Fstub");
  });

  it("falls back when next is unsafe", () => {
    expect(login_redirect_url("https://evil.example")).toBe("/login");
  });
});

describe("session_action_for_status", () => {
  it("clears session on 401 and preserves on 403", () => {
    expect(session_action_for_status(401)).toBe("clear_session");
    expect(session_action_for_status(403)).toBe("preserve_session");
    expect(session_action_for_status(200)).toBe("ok");
  });
});

describe("token_pair_schema", () => {
  it("parses the login envelope and allows missing refresh_token", () => {
    const pair = token_pair_schema.parse({
      access_token: "access-abc",
      token_type: "bearer",
    });
    expect(pair.access_token).toBe("access-abc");
    expect(pair.refresh_token).toBeUndefined();
  });
});

describe("user_profile_schema", () => {
  it("parses consumed /auth/me fields only", () => {
    const profile = user_profile_schema.parse({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["admin"],
    });
    expect(profile.permissions).toEqual(["admin"]);
  });
});
