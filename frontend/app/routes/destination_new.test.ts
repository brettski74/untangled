import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { reset_access_verifier_for_tests } from "../auth/session.server";
import { fake_access_token, install_test_jwt_keys } from "../auth/test_tokens";

const fetch_me = vi.fn();

vi.mock("../auth/api.server", async () => {
  const actual = await vi.importActual<typeof import("../auth/api.server")>(
    "../auth/api.server",
  );
  return {
    ...actual,
    fetch_me: (...args: unknown[]) => fetch_me(...args),
  };
});

async function session_cookie(token = fake_access_token()): Promise<string> {
  const { commit_access_token } = await import("../auth/session.server");
  const set_cookie = await commit_access_token(
    new Request("http://web.test/"),
    token,
  );
  return set_cookie.split(";")[0] ?? set_cookie;
}

function require_data<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  if (value == null) {
    throw new Error("expected loader data");
  }
  return value;
}

const SEED_ADMIN = "01900000-0000-7000-8000-000000000001";

describe("destination_new loader", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    fetch_me.mockReset();
  });

  it("N1: loads INC new with create defaults and layout", async () => {
    fetch_me.mockResolvedValue({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["admin"],
    });
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/incident/new", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident" },
      context: {},
    } as never);

    const body = require_data(result.data);
    expect(body.class_name).toBe("incident");
    expect(body.title_token).toBe("(new)");
    expect(body.copy_path).toBe("/incident/new");
    expect(body.seed_record.status).toBe("new");
    expect(body.seed_record.number).toBeNull();
    expect(body.layout.compact[0]?.name_snake).toBe("number");
    expect(body.layout.text.map((s) => s.name_snake)).toEqual(
      expect.arrayContaining(["summary", "description"]),
    );
  });

  it("N2: loads CHG new with status + requested_by defaults", async () => {
    fetch_me.mockResolvedValue({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["change_request:create", "change_request:read"],
    });
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/change_request/new", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "change_request" },
      context: {},
    } as never);
    const body = require_data(result.data);
    expect(body.seed_record.status).toBe("draft");
    expect(body.seed_record.requested_by).toBe(SEED_ADMIN);
  });

  it("N3: 403 without create permission", async () => {
    fetch_me.mockResolvedValue({
      username: "ro",
      display_name: "Read Only",
      roles: [],
      permissions: ["incident:read"],
    });
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/incident/new", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "incident" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 403, statusText: "Forbidden" });
  });

  it("N4: 404 for unknown collection", async () => {
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/widgets/new", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "widgets" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetch_me).not.toHaveBeenCalled();
  });

  it("N5: redirects when unauthenticated", async () => {
    const { loader } = await import("../routes/destination_new");
    await expect(
      loader({
        request: new Request("http://web.test/incident/new"),
        params: { class_name: "incident" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 302 });
  });

  it("N6: ignores unknown view=", async () => {
    fetch_me.mockResolvedValue({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["admin"],
    });
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/incident/new?view=custom", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident" },
      context: {},
    } as never);
    expect(require_data(result.data).title_token).toBe("(new)");
  });
});

describe("destination_new context bar mount", () => {
  it("W1: portals shared DetailContextBar via ShellContextBar", async () => {
    const source = await readFile(
      new URL("./destination_new.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/shell\/shell_context_bar"/);
    expect(source).toMatch(/from "\.\.\/detail\/detail_context_bar"/);
    expect(source).toMatch(/<ShellContextBar>/);
    expect(source).toMatch(/<DetailContextBar/);
    expect(source).not.toMatch(/DestinationPlaceholder/);
    expect(source).not.toMatch(/render_context_bar/);
    expect(source).not.toMatch(/export const handle/);
  });

  it("W3: Save flushes active editor field and blocks in-flight resubmit", async () => {
    const source = await readFile(
      new URL("./destination_new.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/commit_active_editor_field/);
    expect(source).toMatch(/editor_ref\.current\.draft/);
    expect(source).toMatch(/save_pending/);
  });
});

describe("destination_new datetime chrome (#109)", () => {
  it("W2: new route reuses DetailForm (dual-control datetime)", async () => {
    const source = await readFile(
      new URL("./destination_new.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/detail\/detail_form"/);
    expect(source).toMatch(/<DetailForm/);
    const form_source = await readFile(
      new URL("../detail/detail_form.tsx", import.meta.url),
      "utf8",
    );
    expect(form_source).toMatch(/LocalDatetimeInput/);
    expect(form_source).toMatch(/slot\.type_name === "datetime"/);
  });
});

describe("destination_new leftover actions", () => {
  it("does not export an action", async () => {
    const mod = await import("../routes/destination_new");
    expect(mod).not.toHaveProperty("action");
  });

  it("creates via browser_api and blocks in-flight resubmit", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_new.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/records\/browser_api"/);
    expect(source).toMatch(/create_record/);
    expect(source).toMatch(/prepare_create_body/);
    expect(source).toMatch(/save_pending/);
    expect(source).not.toMatch(/useFetcher/);
    expect(source).not.toMatch(/export async function action/);
    expect(source).not.toMatch(/class_name === ["']incident["']/);
  });
});
