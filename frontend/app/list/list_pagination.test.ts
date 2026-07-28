import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ListPagination chrome", () => {
  it("exposes per-page select, start field, total, and chevron controls", async () => {
    const source = await readFile(
      new URL("./list_pagination.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/ChevronsLeft/);
    expect(source).toMatch(/ChevronLeft/);
    expect(source).toMatch(/ChevronRight/);
    expect(source).toMatch(/ChevronsRight/);
    expect(source).toMatch(/per page/);
    expect(source).toMatch(/PER_PAGE_OPTIONS/);
    expect(source).toMatch(/Starting record/);
    expect(source).toMatch(/Total records/);
    expect(source).toMatch(/per_page_change_needs_refresh/);
    expect(source).toMatch(/search: needs_search/);
    expect(source).toMatch(/disabled=\{!prev_enabled\}/);
    expect(source).toMatch(/disabled=\{!next_enabled\}/);
  });
});
