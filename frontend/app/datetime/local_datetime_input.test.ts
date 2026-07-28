import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("LocalDatetimeInput", () => {
  it("renders disabled date + time dual-control chrome", async () => {
    const source = await readFile(
      new URL("./local_datetime_input.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/local_datetime_control_parts/);
    expect(source).toMatch(/type="date"/);
    expect(source).toMatch(/lang="en-GB"/);
    expect(source).toMatch(/aria-label="Time"/);
    expect(source).toMatch(/disabled/);
    expect(source).toMatch(/inline-flex/);
    expect(source).toMatch(/w-\[9\.5rem\]/);
    expect(source).toMatch(/w-\[calc\(9ch\+1rem\)\]/);
    expect(source).not.toMatch(/\bflex-1\b/);
    expect(source).not.toMatch(/\bw-full\b/);
    expect(source).not.toMatch(/on_commit|onChange|on_enter/);
    expect(source).not.toMatch(/Time24Field/);
  });
});
