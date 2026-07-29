import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { commit_time_24_draft } from "./time_24_field";

describe("commit_time_24_draft", () => {
  it("skips commit when draft matches committed value", () => {
    const commit = vi.fn(() => "14:30:00");
    expect(commit_time_24_draft("14:30:00", "14:30:00", commit)).toBe(
      "14:30:00",
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it("shows normalized time returned by commit on success", () => {
    const commit = vi.fn(() => "12:34:56");
    expect(commit_time_24_draft("123456", "00:00:00", commit)).toBe(
      "12:34:56",
    );
    expect(commit).toHaveBeenCalledWith("123456");
  });

  it("reverts to committed value when commit fails", () => {
    const commit = vi.fn(() => false as const);
    expect(commit_time_24_draft("2pm", "14:30:00", commit)).toBe("14:30:00");
    expect(commit).toHaveBeenCalledWith("2pm");
  });

  it("allows partial input to reach commit handler without mid-edit rejection", () => {
    const commit = vi.fn(() => false as const);
    expect(commit_time_24_draft("14:3", "14:30:00", commit)).toBe("14:30:00");
    expect(commit).toHaveBeenCalledWith("14:3");
  });
});

describe("Time24Field module contracts", () => {
  it("exposes draft commit helper and blur/enter field wiring", async () => {
    const source = await readFile(
      new URL("./time_24_field.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/commit_time_24_draft/);
    expect(source).toMatch(/onChange=\{\(event\) => set_draft\(event\.target\.value\)\}/);
    expect(source).toMatch(/onBlur/);
    expect(source).toMatch(/event\.key === "Enter"/);
    expect(source).toMatch(/string \| false/);
    expect(source).toMatch(
      /Apply outside the draft updater so side-effecting callers are not double-invoked/,
    );
    expect(source).not.toMatch(/parse_time_24h/);
  });
});
