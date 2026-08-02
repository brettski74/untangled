import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";

const api_fetch_with_token = vi.fn();

vi.mock("../auth/api.server", () => ({
  api_fetch_with_token: (...args: unknown[]) => api_fetch_with_token(...args),
}));

describe("create_record", () => {
  beforeEach(() => {
    api_fetch_with_token.mockReset();
  });

  it("C1: returns parsed record on 201 POST to unversioned collection path", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c1",
          number: "INC00000042",
          status: "new",
          summary: "Created",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { create_record } = await import("./create.server");
    const record = await create_record("token", "incidents", {
      summary: "Created",
      status: "new",
      severity: "High",
    });
    expect(record).toEqual({
      id: "c1",
      number: "INC00000042",
      status: "new",
      summary: "Created",
    });
    expect(api_fetch_with_token).toHaveBeenCalledWith("token", "/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Created",
        status: "new",
        severity: "High",
      }),
    });
    const path = api_fetch_with_token.mock.calls[0]?.[1];
    expect(path).toBe("/incidents");
    expect(path).not.toMatch(/^\/api\/v1\//);
  });

  it("C2: propagates 404 / 422 / 400 as Response", async () => {
    const { create_record } = await import("./create.server");

    for (const status of [404, 422, 400] as const) {
      api_fetch_with_token.mockResolvedValue(
        new Response(JSON.stringify({ detail: `err-${status}` }), {
          status,
          statusText: "Error",
        }),
      );
      await expect(
        create_record("token", "incidents", { summary: "x" }),
      ).rejects.toMatchObject({ status });
    }
  });

  it("C3: surfaces ApiForbiddenError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiForbiddenError());
    const { create_record } = await import("./create.server");
    await expect(
      create_record("token", "incidents", { summary: "x" }),
    ).rejects.toBeInstanceOf(ApiForbiddenError);
  });

  it("C4: surfaces ApiUnauthorizedError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiUnauthorizedError());
    const { create_record } = await import("./create.server");
    await expect(
      create_record("token", "incidents", { summary: "x" }),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError);
  });
});

describe("create.server posture", () => {
  it("C5: lives in a .server.ts module; POST not under /api/v1", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./create.server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/api_fetch_with_token/);
    expect(source).toMatch(/method: "POST"/);
    expect(source).toMatch(/`\/\$\{collection\}`/);
    expect(source).not.toMatch(/\/api\/v1/);
    expect(source).not.toMatch(/parse_v1_record/);
  });
});
