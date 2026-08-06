import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("basic_list empty states", () => {
  it("distinguishes match-empty from failed-empty copy and tone", async () => {
    const source = await readFile(
      new URL("./basic_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/export type BasicListEmptyMode = "match" \| "failed"/);
    expect(source).toMatch(/empty_mode\?: BasicListEmptyMode/);
    expect(source).toMatch(/No records match this list\./);
    expect(source).toMatch(
      /This search could not be run\. Previous results were cleared\./,
    );
    expect(source).toMatch(/empty_mode === "failed"/);
    expect(source).toMatch(/text-red-800/);
    expect(source).toMatch(/role=\{failed_empty \? "alert" : undefined\}/);
  });
});

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

  it("formats datetime cells via shared client-local helper", async () => {
    const source = await readFile(
      new URL("./basic_list.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/LocalDatetimeText/);
    expect(source).toMatch(/type_name === "datetime"/);
    expect(source).toMatch(/display_field_value/);
  });
});
