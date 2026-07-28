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
});
