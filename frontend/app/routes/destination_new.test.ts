import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { reset_session_storage_for_tests } from "../auth/session.server";
import { fake_access_token } from "../auth/test_tokens";

const fetch_me = vi.fn();
const create_record = vi.fn();

vi.mock("../auth/api.server", async () => {
  const actual = await vi.importActual<typeof import("../auth/api.server")>(
    "../auth/api.server",
  );
  return {
    ...actual,
    fetch_me: (...args: unknown[]) => fetch_me(...args),
  };
});

vi.mock("../records/create.server", () => ({
  create_record: (...args: unknown[]) => create_record(...args),
}));

async function session_cookie(token = fake_access_token()): Promise<string> {
  const { commit_access_token } = await import("../auth/session.server");
  const set_cookie = await commit_access_token(
    new Request("http://web.test/"),
    token,
  );
  return set_cookie.split(";")[0] ?? set_cookie;
}

const SEED_ADMIN = "01900000-0000-7000-8000-000000000001";

const CREATED_INC = {
  id: "01901234-5678-7abc-89ab-cdef01234567",
  number: "INC00000042",
  summary: "Outage",
  description: null,
  status: "new",
  severity: "High",
  major_incident: false,
  resolved_at: null,
  closed_at: null,
  assigned_user_id: null,
  resolution: null,
  resolution_type: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: SEED_ADMIN,
  updated_by: SEED_ADMIN,
};

describe("destination_new loader", () => {
  beforeEach(() => {
    process.env.UNTANGLED_SESSION_SECRET =
      "test-only-session-secret-not-for-prod";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    reset_session_storage_for_tests();
    fetch_me.mockReset();
    create_record.mockReset();
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
      request: new Request("http://web.test/incidents/new", {
        headers: { Cookie: cookie },
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);

    const body = result.data;
    expect(body.collection).toBe("incidents");
    expect(body.class_name).toBe("incident");
    expect(body.title_token).toBe("(new)");
    expect(body.copy_path).toBe("/incidents/new");
    expect(body.seed_record.status).toBe("new");
    expect(body.seed_record.number).toBeNull();
    expect(body.layout.compact[0]?.name_snake).toBe("number");
    expect(body.layout.text.map((s) => s.name_snake)).toEqual(
      expect.arrayContaining(["summary", "description"]),
    );
    expect(create_record).not.toHaveBeenCalled();
  });

  it("N2: loads CHG new with status + requested_by defaults", async () => {
    fetch_me.mockResolvedValue({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["change-request:create", "change-request:read"],
    });
    const { loader } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/change-requests/new", {
        headers: { Cookie: cookie },
      }),
      params: { collection: "change-requests" },
      context: {},
    } as never);
    expect(result.data.seed_record.status).toBe("draft");
    expect(result.data.seed_record.requested_by).toBe(SEED_ADMIN);
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
        request: new Request("http://web.test/incidents/new", {
          headers: { Cookie: cookie },
        }),
        params: { collection: "incidents" },
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
        params: { collection: "widgets" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetch_me).not.toHaveBeenCalled();
  });

  it("N5: redirects when unauthenticated", async () => {
    const { loader } = await import("../routes/destination_new");
    await expect(
      loader({
        request: new Request("http://web.test/incidents/new"),
        params: { collection: "incidents" },
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
      request: new Request("http://web.test/incidents/new?view=custom", {
        headers: { Cookie: cookie },
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data.title_token).toBe("(new)");
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

describe("destination_new action", () => {
  beforeEach(() => {
    process.env.UNTANGLED_SESSION_SECRET =
      "test-only-session-secret-not-for-prod";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    reset_session_storage_for_tests();
    fetch_me.mockReset();
    create_record.mockReset();
    fetch_me.mockResolvedValue({
      username: "admin",
      display_name: "Admin",
      roles: ["admin"],
      permissions: ["admin"],
    });
  });

  it("A1: valid create merges defaults and returns record", async () => {
    create_record.mockResolvedValue(CREATED_INC);
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          severity: "High",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toEqual({ ok: true, record: CREATED_INC });
    expect(create_record).toHaveBeenCalledWith(
      expect.any(String),
      "incidents",
      expect.objectContaining({
        summary: "Outage",
        severity: "High",
        status: "new",
      }),
    );
    const body = create_record.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("number");
    expect(body).not.toHaveProperty("id");
  });

  it("A2: CHG create retains requested_by when client omits it", async () => {
    create_record.mockResolvedValue({
      id: "0190abcd-5678-7abc-89ab-cdef01234567",
      number: "CHG00000001",
      summary: "Window",
      status: "draft",
      requested_by: SEED_ADMIN,
      scheduled_start: "2026-02-01T00:00:00Z",
      scheduled_end: "2026-02-01T01:00:00Z",
    });
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    await action({
      request: new Request("http://web.test/change-requests/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Window",
          status: "draft",
          scheduled_start: "2026-02-01T00:00:00Z",
          scheduled_end: "2026-02-01T01:00:00Z",
        }),
      }),
      params: { collection: "change-requests" },
      context: {},
    } as never);
    expect(create_record).toHaveBeenCalledWith(
      expect.any(String),
      "change-requests",
      expect.objectContaining({ requested_by: SEED_ADMIN }),
    );
  });

  it("A3: explicit create RBAC → 403 without calling create", async () => {
    fetch_me.mockResolvedValue({
      username: "ro",
      display_name: "Read Only",
      roles: [],
      permissions: ["incident:read"],
    });
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          status: "new",
          severity: "High",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toEqual({
      ok: false,
      status: 403,
      detail: "Forbidden",
    });
    expect(result.init?.status).toBe(403);
    expect(create_record).not.toHaveBeenCalled();
  });

  it("A4: domain forbidden → 403", async () => {
    const { ApiForbiddenError } = await import("../auth/errors");
    create_record.mockRejectedValue(new ApiForbiddenError());
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          status: "new",
          severity: "High",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toEqual({
      ok: false,
      status: 403,
      detail: "Forbidden",
    });
  });

  it("A5: Zod field type failure → 422; no create call", async () => {
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          status: "new",
          severity: "High",
          major_incident: "not-a-boolean",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toMatchObject({ ok: false, status: 422 });
    expect(create_record).not.toHaveBeenCalled();
  });

  it("A6: missing required → 422; no create call", async () => {
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "new" }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toMatchObject({ ok: false, status: 422 });
    expect(create_record).not.toHaveBeenCalled();
  });

  it("A7: unauthenticated → redirect", async () => {
    const { action } = await import("../routes/destination_new");
    await expect(
      action({
        request: new Request("http://web.test/incidents/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: "x" }),
        }),
        params: { collection: "incidents" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 302 });
    expect(create_record).not.toHaveBeenCalled();
  });

  it("A9: domain 422 propagates with detail", async () => {
    create_record.mockRejectedValue(
      new Response(JSON.stringify({ detail: "semantic reject" }), {
        status: 422,
      }),
    );
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          status: "new",
          severity: "High",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data).toMatchObject({
      ok: false,
      status: 422,
      detail: "semantic reject",
    });
  });

  it("A10: post-create record includes friendly-id for navigation preference", async () => {
    create_record.mockResolvedValue(CREATED_INC);
    const { action } = await import("../routes/destination_new");
    const cookie = await session_cookie();
    const result = await action({
      request: new Request("http://web.test/incidents/new", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Outage",
          severity: "High",
        }),
      }),
      params: { collection: "incidents" },
      context: {},
    } as never);
    expect(result.data.ok).toBe(true);
    if (result.data.ok) {
      expect(result.data.record.number).toBe("INC00000042");
      const { preferred_create_locator } = await import(
        "../detail/create_defaults"
      );
      const { class_field_meta } = await import("../generated/field_meta");
      const { record_detail_path } = await import("../records/record_paths");
      const locator = preferred_create_locator(
        class_field_meta("incident")!,
        result.data.record,
      );
      expect(locator).toBe("INC00000042");
      expect(record_detail_path("incidents", locator!)).toBe(
        "/incidents/INC00000042",
      );
    }
  });
});
