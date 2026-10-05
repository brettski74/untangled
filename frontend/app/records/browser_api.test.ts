import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticated_fetch = vi.fn();

vi.mock("../auth/refresh_fetch", () => ({
  authenticated_fetch: (...args: unknown[]) => authenticated_fetch(...args),
}));

describe("browser_api", () => {
  beforeEach(() => {
    authenticated_fetch.mockReset();
  });

  it("POSTs search to /api/v2/{class_name}/search via authenticated_fetch", async () => {
    authenticated_fetch.mockResolvedValue(
      Response.json({
        items: [{ id: "1", summary: "Outage" }],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    );
    const { search_records } = await import("./browser_api");
    const result = await search_records("incident", {
      predicate: null,
      attributes: ["summary"],
      limit: 20,
      offset: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.search.items).toEqual([{ id: "1", summary: "Outage" }]);
      expect(result.search.total).toBe(1);
    }
    expect(authenticated_fetch).toHaveBeenCalledWith(
      "/api/v2/incident/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          predicate: null,
          attributes: ["summary"],
          limit: 20,
          offset: 0,
        }),
      }),
    );
  });

  it("POSTs create and PATCHes update on class-generic paths", async () => {
    authenticated_fetch.mockResolvedValue(
      Response.json(
        { id: "c1", number: "INC00000042", status: "new", summary: "Created" },
        { status: 201 },
      ),
    );
    const { create_record, update_record } = await import("./browser_api");
    const created = await create_record("incident", {
      summary: "Created",
      status: "new",
      severity: "High",
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.record.number).toBe("INC00000042");
    }
    expect(authenticated_fetch).toHaveBeenCalledWith(
      "/api/v2/incident",
      expect.objectContaining({ method: "POST" }),
    );

    authenticated_fetch.mockResolvedValue(
      Response.json({
        id: "u1",
        number: "INC00000001",
        status: "in-progress",
      }),
    );
    const updated = await update_record("incident", "INC00000001", {
      status: "in-progress",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.record.status).toBe("in-progress");
    }
    expect(authenticated_fetch).toHaveBeenCalledWith(
      "/api/v2/incident/INC00000001",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "in-progress" }),
      }),
    );
  });

  it("returns API detail on 403 and 422 without throwing", async () => {
    const { create_record, update_record } = await import("./browser_api");
    authenticated_fetch.mockResolvedValue(
      Response.json({ detail: "Forbidden" }, { status: 403 }),
    );
    const forbidden = await create_record("incident", { summary: "x" });
    expect(forbidden).toEqual({
      ok: false,
      status: 403,
      detail: "Forbidden",
    });

    authenticated_fetch.mockResolvedValue(
      Response.json({ detail: "semantic reject" }, { status: 422 }),
    );
    const invalid = await update_record("incident", "INC00000001", {
      status: "x",
    });
    expect(invalid).toEqual({
      ok: false,
      status: 422,
      detail: "semantic reject",
    });
  });

  it("has no per-class branches", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./browser_api.ts", import.meta.url), "utf8");
    expect(source).toMatch(/authenticated_fetch/);
    expect(source).toMatch(/\/api\/v2\/\$\{class_name\}/);
    expect(source).not.toMatch(/class_name === ["']incident["']/);
    expect(source).not.toMatch(/change_request/);
    expect(source).not.toMatch(/UNTANGLED_API_BASE_URL/);
    expect(source).not.toMatch(/Authorization/);
  });
});
