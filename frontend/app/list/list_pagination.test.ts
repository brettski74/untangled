import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ListPagination chrome", () => {
  it("exposes per-page, left total, start field, and chevron controls", async () => {
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
    expect(source).toMatch(/format_record_count/);
    expect(source).toMatch(/Total records/);
    expect(source).toMatch(/\} records/);
    expect(source).toMatch(/navigator\.languages/);
    expect(source).toMatch(/suppressHydrationWarning/);
    expect(source).toMatch(/per_page_change_needs_refresh/);
    expect(source).toMatch(/search: needs_search/);
    expect(source).toMatch(/disabled=\{!prev_enabled\}/);
    expect(source).toMatch(/disabled=\{!next_enabled\}/);
    // Right cluster is start field only — no slash-total pattern.
    expect(source).not.toMatch(/>\s*\/\s*</);
    expect(source).not.toMatch(/aria-hidden="true">\s*\/\s*</);
  });
});
