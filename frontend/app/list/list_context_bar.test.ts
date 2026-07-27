import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ListContextBar controlled chrome wiring", () => {
  it("does not own selected_name/values state; gates fetcher by list_path", async () => {
    const source = await readFile(
      new URL("./list_context_bar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/selected_name: string/);
    expect(source).toMatch(/on_selected_name_change:/);
    expect(source).not.toMatch(/useState\(\s*\(\)\s*=>\s*quick_filter_ui_defaults/);
    expect(source).not.toMatch(/quick_filter_destination_reset\(/);
    expect(source).toMatch(/fetcher_path_ref\.current !== list_path/);
    expect(source).toMatch(/fetcher_path_ref\.current = list_path/);
  });
});
