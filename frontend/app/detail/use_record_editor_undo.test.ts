/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("use_record_editor_undo", () => {
  it("scopes Ctrl+Z to form subtree and blurs on outside pointer", async () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = await readFile(path.join(dir, "use_record_editor_undo.ts"), "utf8");
    expect(source).toMatch(/form\.contains\(target\)/);
    expect(source).toMatch(/form\.contains\(active\)/);
    expect(source).toMatch(/pointerdown/);
    expect(source).toMatch(/flushSync/);
    expect(source).toMatch(/active\.blur\(\)/);
    expect(source).not.toMatch(/window\.addEventListener\("keydown"/);
  });
});
