import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("DetailContextBar right control cluster", () => {
  it("orders Save, Copy link, Refresh left-to-right with labelled bordered Save", async () => {
    const source = await readFile(
      new URL("./detail_context_bar.tsx", import.meta.url),
      "utf8",
    );
    const cluster = source.match(
      /flex shrink-0 items-center gap-1[\s\S]*?<\/div>\s*<\/div>\s*\);\s*\}/,
    )?.[0];
    expect(cluster).toBeDefined();

    const save_idx = cluster!.indexOf('aria-label="Save"');
    const copy_idx = cluster!.indexOf('aria-label="Copy link"');
    const refresh_idx = cluster!.indexOf('aria-label="Refresh"');
    expect(save_idx).toBeGreaterThan(-1);
    expect(copy_idx).toBeGreaterThan(save_idx);
    expect(refresh_idx).toBeGreaterThan(copy_idx);

    expect(cluster).toMatch(/>\s*Save\s*</);
    expect(cluster).toMatch(/border-\[var\(--color-shell-separator\)\]/);
    expect(cluster).toMatch(/--color-shell-chrome-(fg|muted)/);
    expect(cluster).not.toMatch(/flex-row-reverse/);
    expect(source).not.toMatch(/from ["'].*shell\/header/);
    expect(source).not.toMatch(/HeaderIconButton/);
  });
});
