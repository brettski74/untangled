import { beforeEach, describe, expect, it, vi } from "vitest";

import { reset_session_storage_for_tests } from "../auth/session.server";
import { fake_access_token } from "../auth/test_tokens";
import { reset_default_nav_cache_for_tests } from "../shell/nav_config.server";

const search_collection = vi.fn();

vi.mock("../records/search.server", () => ({
  search_collection: (...args: unknown[]) => search_collection(...args),
}));

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
