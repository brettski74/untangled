import { describe, expect, it } from "vitest";

import { SearchApiError, search_collection } from "./search.server";

describe("search_collection error detail", () => {
  it("raises SearchApiError with FastAPI detail on 422", async () => {
    const original_fetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          detail: "predicate nesting depth exceeds maximum of 3",
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      );

    process.env.UNTANGLED_API_BASE_URL = "http://api.test";

    try {
      await search_collection("token", "incidents", {
        predicate: { op: "and", predicates: [] },
        attributes: ["summary"],
      });
      expect.unreachable("expected SearchApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchApiError);
      if (error instanceof SearchApiError) {
        expect(error.status).toBe(422);
        expect(error.detail).toBe(
          "predicate nesting depth exceeds maximum of 3",
        );
      }
    } finally {
      globalThis.fetch = original_fetch;
    }
  });

  it("raises SearchApiError on 400 structural failures", async () => {
    const original_fetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          detail: "'and' requires a non-empty 'predicates' array",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );

    process.env.UNTANGLED_API_BASE_URL = "http://api.test";

    try {
      await search_collection("token", "incidents", {
        predicate: { op: "and", predicates: [] },
        attributes: ["summary"],
      });
      expect.unreachable("expected SearchApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchApiError);
      if (error instanceof SearchApiError) {
        expect(error.status).toBe(400);
        expect(error.detail).toContain("non-empty");
      }
    } finally {
      globalThis.fetch = original_fetch;
    }
  });
});
