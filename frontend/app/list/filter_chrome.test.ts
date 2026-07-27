import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ListFilterChrome source contracts", () => {
  it("exposes funnel filter row, nested editor actions, and not fail-closed copy", async () => {
    const source = await readFile(
      new URL("./filter_chrome.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/Funnel/);
    expect(source).toMatch(/SquareX/);
    expect(source).toMatch(/RotateCcw/);
    expect(source).toMatch(/Minimize2/);
    expect(source).toMatch(/aria-label="Filter"/);
    expect(source).toMatch(/overflow-hidden text-ellipsis whitespace-nowrap/);
    expect(source).toMatch(/cannot be edited in this UI/);
    expect(source).toMatch(/commit_editor_root/);
    expect(source).toMatch(/load_editor_from_predicate/);
    expect(source).toMatch(/datetime_side_for_op/);
    expect(source).toMatch(/datetime_default_time_for_op/);
    expect(source).toMatch(/should_clear_value_on_field_change/);
  });
});
