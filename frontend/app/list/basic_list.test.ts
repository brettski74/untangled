import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("basic_list header interactions", () => {
  it("exposes grip reorder, primary-only sort icons, and resize separator", async () => {
    const source = await readFile(
      new URL("./basic_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/GripVertical/);
    expect(source).toMatch(/ArrowDownAZ/);
    expect(source).toMatch(/ArrowDownZA/);
    expect(source).toMatch(/aria-sort=\{/);
    expect(source).toMatch(/table-fixed/);
    expect(source).toMatch(/on_sort_click/);
    expect(source).toMatch(/on_reorder/);
    expect(source).toMatch(/on_resize_commit/);
    expect(source).toMatch(/aria-hidden="true"/);
  });

  it("uses fixed ghost + drop-separator overlays instead of cell-ring markers", async () => {
    const source = await readFile(
      new URL("./basic_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/data-testid="column-drag-ghost"/);
    expect(source).toMatch(/data-testid="column-drop-separator"/);
    expect(source).toMatch(/drop_separator_x_for_insert_before/);
    expect(source).toMatch(/opacity-30/);
    expect(source).not.toMatch(/ring-inset ring-1 ring-sky-500/);
    expect(source).not.toMatch(/paint_drop_marker/);
  });
});
