import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("detail_form datetime display", () => {
  it("uses shared client-local datetime controls for datetime slots", async () => {
    const source = await readFile(
      new URL("./detail_form.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/LocalDatetimeInput/);
    expect(source).toMatch(/display_field_value/);
    expect(source).toMatch(/slot\.type_name === "datetime"/);
    expect(source).not.toMatch(/display_text\(/);
  });
});
