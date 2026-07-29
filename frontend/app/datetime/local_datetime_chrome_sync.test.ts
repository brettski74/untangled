import { describe, expect, it } from "vitest";

import { sync_datetime_chrome_from_committed } from "./local_datetime_chrome_sync";

describe("sync_datetime_chrome_from_committed", () => {
  it("clears parts and bumps remount key when committed value is null", () => {
    expect(sync_datetime_chrome_from_committed(0, null)).toEqual({
      remount_key: 1,
      parts: { date: "", time: "" },
    });
  });

  it("clears parts for non-string / empty committed values", () => {
    expect(sync_datetime_chrome_from_committed(3, undefined).parts).toEqual({
      date: "",
      time: "",
    });
    expect(sync_datetime_chrome_from_committed(3, "").parts).toEqual({
      date: "",
      time: "",
    });
    expect(sync_datetime_chrome_from_committed(3, 12).remount_key).toBe(4);
  });

  it("restores parts from a valid committed ISO value", () => {
    const next = sync_datetime_chrome_from_committed(
      1,
      "2026-07-14T05:02:34Z",
    );
    expect(next.remount_key).toBe(2);
    expect(next.parts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(next.parts.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
