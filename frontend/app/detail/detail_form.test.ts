import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("detail_form datetime display", () => {
  it("uses LocalDatetimeInput for datetime slots in editable and read-only modes", async () => {
    const source = await readFile(
      new URL("./detail_form.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/LocalDatetimeInput/);
    expect(source).toMatch(/slot\.type_name === "datetime"/);
    expect(source).toMatch(/editable=\{editable\}/);
    expect(source).not.toMatch(/display_text\(/);
    // Editable datetime must not fall through to a plain ISO text input.
    expect(source).not.toMatch(
      /slot\.type_name === "datetime" && editable[\s\S]*?type="text"/,
    );
    expect(source).not.toMatch(/plain ISO/);
  });
});
