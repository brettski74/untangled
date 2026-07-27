import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("shell context bar mount wiring", () => {
  it("layout hosts one always-present strip with portal-only mount", async () => {
    const source = await readFile(
      new URL("./shell_layout.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/ShellContextBarProvider/);
    expect(source).toMatch(
      /aria-label=\{occupied \? "Context bar" : undefined\}/,
    );
    expect(source).toMatch(/aria-hidden=\{occupied \? undefined : true\}/);
    expect(source).not.toMatch(/className=\{\s*occupied[\s\S]*?"hidden"/);
    expect(source).not.toMatch(/from "\.\/context_bar"/);
    expect(source).not.toMatch(/RouteHandleContextBar/);
    expect(source).not.toMatch(/render_context_bar/);
  });

  it("portal API fails closed on dual occupants", async () => {
    const source = await readFile(
      new URL("./shell_context_bar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/claim_shell_context_bar_occupant/);
    expect(source).toMatch(/SHELL_CONTEXT_BAR_DUAL_OCCUPANT_ERROR/);
    expect(source).toMatch(/claim_occupant/);
  });
});
