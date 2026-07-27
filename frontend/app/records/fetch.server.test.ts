import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";

const api_fetch_with_token = vi.fn();

vi.mock("../auth/api.server", () => ({
  api_fetch_with_token: (...args: unknown[]) => api_fetch_with_token(...args),
}));

describe("fetch_record", () => {
  beforeEach(() => {
    api_fetch_with_token.mockReset();
  });

  it("S1: returns parsed generic record on 200", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(JSON.stringify({ id: "u1", number: "INC00000001" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { fetch_record } = await import("./fetch.server");
    const record = await fetch_record("token", "incidents", "INC00000001");
    expect(record).toEqual({ id: "u1", number: "INC00000001" });
    expect(api_fetch_with_token).toHaveBeenCalledWith(
      "token",
      "/incidents/INC00000001",
      { method: "GET" },
    );
  });

  it("S2: propagates 404 and 422 as Response", async () => {
    const { fetch_record } = await import("./fetch.server");

    api_fetch_with_token.mockResolvedValue(
      new Response("missing", { status: 404, statusText: "Not Found" }),
    );
    await expect(
      fetch_record("token", "incidents", "INC999"),
    ).rejects.toMatchObject({ status: 404 });

    api_fetch_with_token.mockResolvedValue(
      new Response("junk", { status: 422, statusText: "Unprocessable Entity" }),
    );
    await expect(
      fetch_record("token", "incidents", "not-a-locator"),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("S3: surfaces ApiForbiddenError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiForbiddenError());
    const { fetch_record } = await import("./fetch.server");
    await expect(
      fetch_record("token", "incidents", "INC00000001"),
    ).rejects.toBeInstanceOf(ApiForbiddenError);
  });

  it("S4: surfaces ApiUnauthorizedError from api seam", async () => {
    api_fetch_with_token.mockRejectedValue(new ApiUnauthorizedError());
    const { fetch_record } = await import("./fetch.server");
    await expect(
      fetch_record("token", "incidents", "INC00000001"),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError);
  });

  it("S5: rejects non-object JSON bodies", async () => {
    api_fetch_with_token.mockResolvedValue(
      new Response(JSON.stringify(["not", "an", "object"]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { fetch_record } = await import("./fetch.server");
    await expect(
      fetch_record("token", "incidents", "INC00000001"),
    ).rejects.toThrow();
  });
});
