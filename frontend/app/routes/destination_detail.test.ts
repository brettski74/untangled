import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { reset_access_verifier_for_tests } from "../auth/session.server";
import { fake_access_token, install_test_jwt_keys } from "../auth/test_tokens";

const fetch_record = vi.fn();

vi.mock("../records/fetch.server", () => ({
  fetch_record: (...args: unknown[]) => fetch_record(...args),
}));

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

const INC_RECORD = {
  id: "01901234-5678-7abc-89ab-cdef01234567",
  number: "INC00000001",
  summary: "Outage",
  description: "Long text",
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
  created_by: "01900000-0000-7000-8000-000000000001",
  updated_by: "01900000-0000-7000-8000-000000000001",
};

const CHG_RECORD = {
  id: "0190abcd-5678-7abc-89ab-cdef01234567",
  number: "CHG00000001",
  summary: "Window",
  description: null,
  status: "draft",
  risk_score: 10,
  scheduled_start: "2026-02-01T00:00:00Z",
  scheduled_end: "2026-02-01T01:00:00Z",
  actual_start: null,
  actual_end: null,
  assigned_user_id: null,
  requested_by: "01900000-0000-7000-8000-000000000001",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: "01900000-0000-7000-8000-000000000001",
  updated_by: "01900000-0000-7000-8000-000000000001",
};

describe("destination_detail loader", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
    fetch_record.mockReset();
  });

  it("D1: loads INC by friendly-id", async () => {
    fetch_record.mockResolvedValue(INC_RECORD);
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/incident/INC00000001", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident", locator: "INC00000001" },
      context: {},
    } as never);

    const body = require_data(result.data);
    expect(body.class_name).toBe("incident");
    expect(body.title_token).toBe("INC00000001");
    expect(body.record.number).toBe("INC00000001");
    expect(body.layout.compact[0]?.name_snake).toBe("number");
    expect(body.layout.text.map((s) => s.name_snake)).toEqual(
      expect.arrayContaining(["summary", "description"]),
    );
    expect(body.layout.compact.some((s) => s.name_snake === "id")).toBe(false);
    expect(fetch_record).toHaveBeenCalledWith(
      expect.any(String),
      "incident",
      "INC00000001",
    );
  });

  it("D2: loads INC by UUID", async () => {
    fetch_record.mockResolvedValue(INC_RECORD);
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request(
        `http://web.test/incident/${INC_RECORD.id}`,
        { headers: { Cookie: cookie } },
      ),
      params: { class_name: "incident", locator: INC_RECORD.id },
      context: {},
    } as never);
    const body = require_data(result.data);
    expect(body.title_token).toBe("INC00000001");
    expect(body.copy_path).toBe("/incident/INC00000001");
  });

  it("D3: loads CHG by friendly-id", async () => {
    fetch_record.mockResolvedValue(CHG_RECORD);
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/change_request/CHG00000001", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "change_request", locator: "CHG00000001" },
      context: {},
    } as never);
    const body = require_data(result.data);
    expect(body.class_name).toBe("change_request");
    expect(body.class_display_name).toBe("Change Request");
    expect(body.layout.compact.some((s) => s.name_snake === "status")).toBe(
      true,
    );
  });

  it("D4: 404s for unknown collection", async () => {
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/widgets/W1", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "widgets", locator: "W1" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetch_record).not.toHaveBeenCalled();
  });

  it("D5: propagates missing record 404", async () => {
    fetch_record.mockRejectedValue(
      new Response("not found", { status: 404 }),
    );
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/incident/INC999", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "incident", locator: "INC999" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("D6: propagates junk locator 422", async () => {
    fetch_record.mockRejectedValue(
      new Response("junk", { status: 422 }),
    );
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/incident/not-a-locator", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "incident", locator: "not-a-locator" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("D7: throws 403 when fetch is forbidden", async () => {
    const { ApiForbiddenError } = await import("../auth/errors");
    fetch_record.mockRejectedValue(new ApiForbiddenError());
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/incident/INC00000001", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "incident", locator: "INC00000001" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 403, statusText: "Forbidden" });
  });

  it("D8: redirects when unauthenticated", async () => {
    const { loader } = await import("../routes/destination_detail");
    await expect(
      loader({
        request: new Request("http://web.test/incident/INC00000001"),
        params: { class_name: "incident", locator: "INC00000001" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 302 });
    expect(fetch_record).not.toHaveBeenCalled();
  });

  it("D9: ignores unknown view= and still loads", async () => {
    fetch_record.mockResolvedValue(INC_RECORD);
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request(
        "http://web.test/incident/INC00000001?view=custom-unknown",
        { headers: { Cookie: cookie } },
      ),
      params: { class_name: "incident", locator: "INC00000001" },
      context: {},
    } as never);
    expect(require_data(result.data).record.number).toBe("INC00000001");
  });

  it("D10: calls fetch seam once with collection + locator (no search)", async () => {
    fetch_record.mockResolvedValue(INC_RECORD);
    const { loader } = await import("../routes/destination_detail");
    const cookie = await session_cookie();
    await loader({
      request: new Request("http://web.test/incident/INC00000001", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident", locator: "INC00000001" },
      context: {},
    } as never);
    expect(fetch_record).toHaveBeenCalledTimes(1);
    expect(fetch_record.mock.calls[0]?.slice(1)).toEqual([
      "incident",
      "INC00000001",
    ]);
  });
});

describe("destination_detail context bar mount", () => {
  it("portals DetailContextBar via ShellContextBar; no handle export", async () => {
    const source = await readFile(
      new URL("./destination_detail.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/shell\/shell_context_bar"/);
    expect(source).toMatch(/<ShellContextBar>/);
    expect(source).toMatch(/<DetailContextBar/);
    expect(source).not.toMatch(/render_context_bar/);
    expect(source).not.toMatch(/context_bar_handle/);
    expect(source).not.toMatch(/export const handle/);
  });
});

describe("destination_detail leftover actions", () => {
  it("does not export an action", async () => {
    const mod = await import("../routes/destination_detail");
    expect(mod).not.toHaveProperty("action");
  });

  it("updates via browser_api and applies the returned record", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_detail.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/records\/browser_api"/);
    expect(source).toMatch(/update_record/);
    expect(source).toMatch(/prepare_update_body/);
    expect(source).toMatch(/reset_editor_from_record\(result\.record/);
    expect(source).not.toMatch(/useFetcher/);
    expect(source).not.toMatch(/export async function action/);
    expect(source).not.toMatch(/class_name === ["']incident["']/);
  });
});
