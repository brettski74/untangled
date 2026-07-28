import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("detail_form datetime display", () => {
  it("uses shared read-only dual-control datetime chrome for datetime slots", async () => {
    const source = await readFile(
      new URL("./detail_form.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/LocalDatetimeInput/);
    expect(source).toMatch(/slot\.type_name === "datetime"/);
    expect(source).not.toMatch(/display_text\(/);
  });
});
