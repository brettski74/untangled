import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ListContextBar controlled chrome wiring", () => {
  it("does not own selected_name/values state; receives shared submit", async () => {
    const source = await readFile(
      new URL("./list_context_bar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/selected_name: string/);
    expect(source).toMatch(/on_selected_name_change:/);
    expect(source).toMatch(/submit_predicate:/);
    expect(source).toMatch(/effective_ref:/);
    expect(source).not.toMatch(/useState\(\s*\(\)\s*=>\s*quick_filter_ui_defaults/);
    expect(source).not.toMatch(/quick_filter_destination_reset\(/);
    expect(source).not.toMatch(/useFetcher/);
  });

  it("uses paired date and 24-hour text time inputs for datetime quick filters", async () => {
    const source = await readFile(
      new URL("./list_context_bar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/type="date"/);
    expect(source).toMatch(/Time24Field/);
    expect(source).toMatch(/from "\.\/time_24_field"/);
    expect(source).toMatch(/apply_datetime_date_change/);
    expect(source).toMatch(/commit_date_and_enter/);
    expect(source).toMatch(/values_ref\.current/);
    expect(source).not.toMatch(/datetime-local/);
    expect(source).not.toMatch(/type=\{?"time"\}?/);
    expect(source).not.toMatch(/react-datetime-picker/);
    // Disabled empty To must not look pre-filled with end-of-day.
    expect(source).not.toMatch(
      /placeholder=\{DATETIME_TO_DEFAULT_TIME\}/,
    );
  });
});

describe("DestinationListPage shared search submit", () => {
  it("owns fetcher path gating and filter chrome mount", async () => {
    const source = await readFile(
      new URL("../routes/destination_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/fetcher_path_ref\.current !== loaderData\.path/);
    expect(source).toMatch(/fetcher_path_ref\.current = loaderData\.path/);
    expect(source).toMatch(/ListFilterChrome/);
    expect(source).toMatch(/SearchApiError/);
  });
});
