import { beforeEach, describe, expect, it, vi } from "vitest";

import { reset_access_verifier_for_tests } from "../auth/session.server";
import { fake_access_token, install_test_jwt_keys } from "../auth/test_tokens";
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

function require_data<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  if (value == null) {
    throw new Error("expected loader data");
  }
  return value;
}

describe("destination_list loader", () => {
  beforeEach(() => {
    process.env.UNTANGLED_API_BASE_URL = "http://api.test";
    process.env.UNTANGLED_AUTH_BASE_URL = "http://auth.test";
    process.env.UNTANGLED_COOKIE_SECURE = "false";
    install_test_jwt_keys();
    reset_access_verifier_for_tests();
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
      request: new Request("http://web.test/incident/lists/all", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident", list_id: "all" },
      context: {},
    } as never);

    const body = require_data(result.data);
    expect(body.class_name).toBe("incident");
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
    expect(collection).toBe("incident");
    expect(search_body).toMatchObject({
      predicate: null,
      attributes: expect.arrayContaining(["number", "summary", "status"]),
    });
    expect(search_body).not.toHaveProperty("sort");
  });

  it("returns null on expired GET without searching", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { loader } = await import("../routes/destination_list");
    const cookie = await session_cookie(
      fake_access_token(60, { iat: now - 120, exp: now - 10 }),
    );
    const result = await loader({
      request: new Request("http://web.test/incident/lists/all", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident", list_id: "all" },
      context: {},
    } as never);

    expect(result.data).toBeNull();
    expect(search_collection).not.toHaveBeenCalled();
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
      request: new Request("http://web.test/incident/lists/open", {
        headers: { Cookie: cookie },
      }),
      params: { class_name: "incident", list_id: "open" },
      context: {},
    } as never);

    const body = require_data(result.data);
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
        request: new Request("http://web.test/incident/lists/nope", {
          headers: { Cookie: cookie },
        }),
        params: { class_name: "incident", list_id: "nope" },
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
          "http://web.test/change_request/lists/open",
          { headers: { Cookie: cookie } },
        ),
        params: { class_name: "change_request", list_id: "open" },
        context: {},
      } as never),
    ).rejects.toMatchObject({
      status: 403,
      statusText: "Forbidden",
    });
  });
});

describe("destination_list leftover actions", () => {
  it("does not export an action or shouldRevalidate", async () => {
    const mod = await import("../routes/destination_list");
    expect(mod).not.toHaveProperty("action");
    expect(mod).not.toHaveProperty("shouldRevalidate");
  });

  it("searches via browser_api search_records, not useFetcher", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/from "\.\.\/records\/browser_api"/);
    expect(source).toMatch(/search_records/);
    expect(source).not.toMatch(/useFetcher/);
    expect(source).not.toMatch(/export async function action/);
    expect(source).not.toMatch(/class_name === ["']incident["']/);
  });
});

describe("destination_list filter editor destination identity", () => {
  it("remounts ListFilterChrome when loaderData.path changes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/<ListFilterChrome[\s\S]*key=\{loaded\.path\}/);
  });
});

describe("destination_list context bar destination identity", () => {
  it("resyncs search and quick-filter together on loaderData.path", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/list_destination_ui_sync\(loaded\)/);
    expect(source).toMatch(
      /set_selected_name\(synced\.quick_filter\.selected_name\)/,
    );
    expect(source).toMatch(/set_values\(synced\.quick_filter\.values\)/);
    expect(source).toMatch(/set_sort\(\[\]\)/);
    expect(source).toMatch(
      /\/\/ Same destination identity[\s\S]*\[loaded\.path\]/,
    );
  });

  it("uses a single submit_search seam for predicate, sort, and paging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/const submit_search = useCallback/);
    expect(source).toMatch(/submit_search=\{submit_search\}/);
    expect(source).not.toMatch(/submit_predicate/);
    expect(source).toMatch(/args\.sort \?\? sort_ref\.current/);
    expect(source).toMatch(/search_records\(loaded\.class_name/);
    expect(source).toMatch(/\.\.\.\(sort\.length > 0 \? \{ sort \} : \{\}\)/);
    expect(source).toMatch(/limit,/);
    expect(source).toMatch(/offset,/);
  });
});

describe("destination_list soft search failure", () => {
  it("clears rows on soft failure without adopting the failed predicate", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    // Soft failure: warn + clear displayed results; keep last-good effective_predicate.
    expect(source).toMatch(
      /if \(!result\.ok\) \{[\s\S]*?set_warning\(result\.detail\)[\s\S]*?set_search_failed\(true\)[\s\S]*?set_search\(\([\s\S]*?rows: \[\][\s\S]*?total: 0[\s\S]*?offset: 0[\s\S]*?effective_predicate: current\.effective_predicate[\s\S]*?\)[\s\S]*?return;/,
    );
    // Success clears failed mode and replaces rows as before.
    expect(source).toMatch(/set_search_failed\(false\)/);
    expect(source).toMatch(/empty_mode=\{search_failed \? "failed" : "match"\}/);
    // Destination change resets failed mode with the rest of list chrome.
    expect(source).toMatch(/set_search_failed\(false\)/);
  });
});

describe("destination_list header interactions", () => {
  it("wires BasicList sort, reorder, and resize callbacks", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/on_sort_click=\{on_sort_click\}/);
    expect(source).toMatch(/on_reorder=\{on_reorder\}/);
    expect(source).toMatch(/on_resize_commit=\{on_resize_commit\}/);
  });
});

describe("destination_list pagination", () => {
  it("renders ListPagination and drops the interim title/count strip", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/<ListPagination/);
    expect(source).toMatch(/on_paging_change=\{on_paging_change\}/);
    expect(source).toMatch(/start_past_last_page/);
    expect(source).not.toMatch(
      /<h1[\s\S]*option_display_name/,
    );
    expect(source).not.toMatch(/\$\{search\.total\} records/);
  });
});
