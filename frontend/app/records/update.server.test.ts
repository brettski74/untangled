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

  it("U1: returns parsed record on 200 PATCH", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "u1", number: "INC00000001", status: "in-progress" }),
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
    });
    expect(api_fetch_with_token).toHaveBeenCalledWith(
      "token",
      "/incidents/INC00000001",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in-progress" }),
      },
    );
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
  it("U5: lives in a .server.ts module", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./update.server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/api_fetch_with_token/);
    expect(source).toMatch(/method: "PATCH"/);
  });
});
