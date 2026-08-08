import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";

const api_fetch_with_token = vi.fn();

vi.mock("../auth/api.server", () => ({
  api_fetch_with_token: (...args: unknown[]) => api_fetch_with_token(...args),
}));

describe("update_record", () => {
  beforeEach(() => {
    api_fetch_with_token.mockReset();
  });

  it("U1: returns parsed v1 record on 200 PATCH", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "u1",
          number: "INC00000001",
          status: "in-progress",
          created_by: { id: "user-1", display_name: "Local Admin" },
          updated_by: { id: "user-1", display_name: "Local Admin" },
          assigned_user_id: { id: "user-2", display_name: "Local Read-Write" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { update_record } = await import("./update.server");
    const record = await update_record("token", "incidents", "INC00000001", {
      status: "in-progress",
    });
    expect(record).toEqual({
      id: "u1",
      number: "INC00000001",
      status: "in-progress",
      created_by: { id: "user-1", display_name: "Local Admin" },
      updated_by: { id: "user-1", display_name: "Local Admin" },
      assigned_user_id: { id: "user-2", display_name: "Local Read-Write" },
    });
    expect(api_fetch_with_token).toHaveBeenCalledWith(
      "token",
      "/api/v1/incidents/INC00000001",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in-progress" }),
      },
    );
  });

  it("U1b: rejects scalar FK values in v1 update response", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "u1",
          created_by: "01900000-0000-7000-8000-000000000001",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { update_record } = await import("./update.server");
    await expect(
      update_record("token", "incidents", "INC00000001", { status: "x" }),
    ).rejects.toThrow();
  });

  it("U2: propagates 404 / 422 / 400 as Response", async () => {
    const { update_record } = await import("./update.server");

    for (const status of [404, 422, 400] as const) {
      api_fetch_with_token.mockResolvedValue(
        new Response(JSON.stringify({ detail: `err-${status}` }), {
          status,
          statusText: "Error",
        }),
      );
      await expect(
        update_record("token", "incidents", "INC999", { status: "x" }),
      ).rejects.toMatchObject({ status });
    }
  });

  it("U3: surfaces ApiForbiddenError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiForbiddenError());
    const { update_record } = await import("./update.server");
    await expect(
      update_record("token", "incidents", "INC00000001", { status: "x" }),
    ).rejects.toBeInstanceOf(ApiForbiddenError);
  });

  it("U4: surfaces ApiUnauthorizedError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiUnauthorizedError());
    const { update_record } = await import("./update.server");
    await expect(
      update_record("token", "incidents", "INC00000001", { status: "x" }),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError);
  });
});

describe("update.server posture", () => {
  it("U5: lives in a .server.ts module and targets /api/v1", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./update.server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/api_fetch_with_token/);
    expect(source).toMatch(/method: "PATCH"/);
    expect(source).toMatch(/\/api\/v1\/\$\{collection\}/);
    expect(source).toMatch(/parse_v1_record/);
  });
});
