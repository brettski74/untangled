import { beforeEach, describe, expect, it, vi } from "vitest";

import { reset_session_storage_for_tests } from "../auth/session.server";
import { fake_access_token } from "../auth/test_tokens";
import { reset_default_nav_cache_for_tests } from "../shell/nav_config.server";

const search_collection = vi.fn();

vi.mock("../records/search.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../records/search.server")>();
  return {
    ...actual,
    search_collection: (...args: unknown[]) => search_collection(...args),
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

describe("destination_list loader", () => {
  beforeEach(() => {
    process.env.UNTANGLED_SESSION_SECRET = "test-only-session-secret-not-for-prod";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    reset_session_storage_for_tests();
    reset_default_nav_cache_for_tests();
    search_collection.mockReset();
  });

  it("returns schema columns and search rows for a nav list", async () => {
    search_collection.mockResolvedValue({
      items: [
        {
          id: "01901234-5678-7abc-89ab-cdef01234567",
          number: "INC00000001",
          summary: "Outage",
          status: "new",
        },
      ],
      limit: 20,
      offset: 0,
      total: 1,
    });

    const { loader } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/incidents/lists/all", {
        headers: { Cookie: cookie },
      }),
      params: { collection: "incidents", list_id: "all" },
      context: {},
    } as never);

    const body = result.data;
    expect(body.collection).toBe("incidents");
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.columns[0]?.name_snake).toBe("number");
    expect(body.columns[0]?.is_friendly_id).toBe(true);
    expect(body.class_display_name).toBe("Incident");
    expect(body.baseline_predicate).toBeNull();
    expect(body.effective_predicate).toBeNull();
    expect(body.attributes.some((a) => a.name_snake === "summary")).toBe(true);
    expect(search_collection).toHaveBeenCalledTimes(1);
    const [, collection, search_body] = search_collection.mock.calls[0] ?? [];
    expect(collection).toBe("incidents");
    expect(search_body).toMatchObject({
      predicate: null,
      attributes: expect.arrayContaining(["number", "summary", "status"]),
    });
    expect(search_body).not.toHaveProperty("sort");
  });

  it("returns empty rows when search finds nothing", async () => {
    search_collection.mockResolvedValue({
      items: [],
      limit: 20,
      offset: 0,
      total: 0,
    });

    const { loader } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const result = await loader({
      request: new Request("http://web.test/incidents/lists/open", {
        headers: { Cookie: cookie },
      }),
      params: { collection: "incidents", list_id: "open" },
      context: {},
    } as never);

    const body = result.data;
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.baseline_predicate).toMatchObject({ op: "and" });
    expect(body.effective_predicate).toMatchObject({ op: "and" });
    const search_body = search_collection.mock.calls[0]?.[2] as {
      predicate?: { op?: string };
    };
    expect(search_body.predicate).toMatchObject({ op: "and" });
  });

  it("404s for unknown list destinations", async () => {
    const { loader } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request("http://web.test/incidents/lists/nope", {
          headers: { Cookie: cookie },
        }),
        params: { collection: "incidents", list_id: "nope" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(search_collection).not.toHaveBeenCalled();
  });

  it("throws 403 Forbidden when search is denied", async () => {
    const { ApiForbiddenError } = await import("../auth/errors");
    search_collection.mockRejectedValue(new ApiForbiddenError());

    const { loader } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    await expect(
      loader({
        request: new Request(
          "http://web.test/change-requests/lists/open",
          { headers: { Cookie: cookie } },
        ),
        params: { collection: "change-requests", list_id: "open" },
        context: {},
      } as never),
    ).rejects.toMatchObject({
      status: 403,
      statusText: "Forbidden",
    });
  });
});

describe("destination_list action", () => {
  beforeEach(() => {
    process.env.UNTANGLED_SESSION_SECRET = "test-only-session-secret-not-for-prod";
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    reset_session_storage_for_tests();
    reset_default_nav_cache_for_tests();
    search_collection.mockReset();
  });

  it("forwards posted predicate and echoes it", async () => {
    search_collection.mockResolvedValue({
      items: [{ id: "1", summary: "Filtered" }],
      limit: 20,
      offset: 0,
      total: 1,
    });

    const { action } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const predicate = {
      op: "contains",
      attribute: "summary",
      value: "Filtered",
    };
    const form = new FormData();
    form.set("predicate", JSON.stringify(predicate));

    const result = await action({
      request: new Request("http://web.test/incidents/lists/all", {
        method: "POST",
        headers: { Cookie: cookie },
        body: form,
      }),
      params: { collection: "incidents", list_id: "all" },
      context: {},
    } as never);

    expect(result.data).toMatchObject({
      ok: true,
      total: 1,
      rows: [{ id: "1", summary: "Filtered" }],
      effective_predicate: predicate,
    });
    expect(search_collection).toHaveBeenCalledTimes(1);
    const search_body = search_collection.mock.calls[0]?.[2] as {
      predicate?: unknown;
      sort?: unknown;
    };
    expect(search_body.predicate).toEqual(predicate);
    expect(search_body).not.toHaveProperty("sort");
  });

  it("400s on invalid predicate JSON", async () => {
    const { action } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const form = new FormData();
    form.set("predicate", "{");

    await expect(
      action({
        request: new Request("http://web.test/incidents/lists/all", {
          method: "POST",
          headers: { Cookie: cookie },
          body: form,
        }),
        params: { collection: "incidents", list_id: "all" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(search_collection).not.toHaveBeenCalled();
  });

  it("returns search API detail on 422 without throwing", async () => {
    const { SearchApiError } = await import("../records/search.server");
    search_collection.mockRejectedValue(
      new SearchApiError(
        422,
        "predicate nesting depth exceeds maximum of 3",
      ),
    );

    const { action } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const form = new FormData();
    form.set(
      "predicate",
      JSON.stringify({
        op: "and",
        predicates: [{ op: "eq", attribute: "status", value: "new" }],
      }),
    );

    const result = await action({
      request: new Request("http://web.test/incidents/lists/all", {
        method: "POST",
        headers: { Cookie: cookie },
        body: form,
      }),
      params: { collection: "incidents", list_id: "all" },
      context: {},
    } as never);

    expect(result.init?.status).toBe(422);
    expect(result.data).toEqual({
      ok: false,
      status: 422,
      detail: "predicate nesting depth exceeds maximum of 3",
    });
  });

  it("throws 403 when search is denied", async () => {
    const { ApiForbiddenError } = await import("../auth/errors");
    search_collection.mockRejectedValue(new ApiForbiddenError());

    const { action } = await import("../routes/destination_list");
    const cookie = await session_cookie();
    const form = new FormData();
    form.set("predicate", "null");

    await expect(
      action({
        request: new Request("http://web.test/incidents/lists/all", {
          method: "POST",
          headers: { Cookie: cookie },
          body: form,
        }),
        params: { collection: "incidents", list_id: "all" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("destination_list shouldRevalidate", () => {
  it("skips revalidation after POST actions", async () => {
    const { shouldRevalidate } = await import("../routes/destination_list");
    expect(
      shouldRevalidate({
        formMethod: "POST",
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
    expect(
      shouldRevalidate({
        formMethod: "GET",
        defaultShouldRevalidate: true,
      }),
    ).toBe(true);
  });
});

describe("destination_list context bar destination identity", () => {
  it("resyncs search and quick-filter together on loaderData.path", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/list_destination_ui_sync\(loaderData\)/);
    expect(source).toMatch(
      /set_selected_name\(synced\.quick_filter\.selected_name\)/,
    );
    expect(source).toMatch(/set_values\(synced\.quick_filter\.values\)/);
    expect(source).toMatch(
      /\/\/ Same destination identity[\s\S]*\[loaderData\.path\]/,
    );
  });
});
