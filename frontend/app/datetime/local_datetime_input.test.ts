import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("LocalDatetimeInput", () => {
  it("renders dual-control chrome for read-only and editable modes", async () => {
    const source = await readFile(
      new URL("./local_datetime_input.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/local_datetime_control_parts/);
    expect(source).toMatch(/type="date"/);
    expect(source).toMatch(/lang="en-GB"/);
    expect(source).toMatch(/aria-label="Time"/);
    expect(source).toMatch(/Time24Field/);
    expect(source).toMatch(/editable/);
    expect(source).toMatch(/on_change/);
    expect(source).toMatch(/iso_to_local_combined/);
    expect(source).toMatch(/local_combined_to_iso/);
    expect(source).toMatch(/apply_datetime_date_change/);
    expect(source).toMatch(/apply_datetime_time_change/);
    expect(source).toMatch(/relatedTarget/);
    // Pair blur must discard incomplete native date drafts (Time24Field parity).
    expect(source).toMatch(/sync_datetime_chrome_from_committed/);
    expect(source).toMatch(/date_remount_key/);
    expect(source).toMatch(/key=\{date_remount_key\}/);
    expect(source).toMatch(/set_date_remount_key\(synced\.remount_key\)/);
    expect(source).toMatch(/set_parts\(synced\.parts\)/);
    expect(source).toMatch(/inline-flex/);
    expect(source).toMatch(/w-\[9\.5rem\]/);
    expect(source).toMatch(/w-\[calc\(9ch\+1rem\)\]/);
    expect(source).not.toMatch(/\bflex-1\b/);
    expect(source).not.toMatch(/\bw-full\b/);
    expect(source).not.toMatch(/datetime-local/);
  });
});
