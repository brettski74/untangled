import { describe, expect, it } from "vitest";

import {
  apply_datetime_date_change,
  apply_datetime_time_change,
  combine_datetime_local,
  DATETIME_FROM_DEFAULT_TIME,
  DATETIME_TO_DEFAULT_TIME,
  split_datetime_local,
} from "./local_datetime_compose";

describe("datetime local split/combine", () => {
  it("apply_datetime_date_change defaults missing time by side", () => {
    expect(apply_datetime_date_change("from", "2026-07-27", undefined)).toBe(
      "2026-07-27T00:00:00",
    );
    expect(apply_datetime_date_change("to", "2026-07-27", undefined)).toBe(
      "2026-07-27T23:59:59",
    );
    expect(
      apply_datetime_date_change("from", "2026-07-28", "2026-07-27T15:30:00"),
    ).toBe("2026-07-28T15:30:00");
  });

  it("apply_datetime_time_change requires a date first", () => {
    expect(
      apply_datetime_time_change(
        "14:30:00",
        undefined,
        DATETIME_FROM_DEFAULT_TIME,
      ),
    ).toEqual({
      ok: false,
      warning: "Pick a date first (time defaults when you choose a date).",
    });
  });

  it("splits and combines local datetime strings", () => {
    expect(split_datetime_local("2026-07-27T14:30:45")).toEqual({
      date: "2026-07-27",
      time: "14:30:45",
    });
    expect(split_datetime_local("2026-07-27T14:30")).toEqual({
      date: "2026-07-27",
      time: "14:30:00",
    });
    expect(
      combine_datetime_local("2026-07-27", "", DATETIME_TO_DEFAULT_TIME),
    ).toBe("2026-07-27T23:59:59");
  });

  it("apply_datetime_time_change validates and normalizes", () => {
    expect(
      apply_datetime_time_change(
        "14:30",
        "2026-07-27T00:00:00",
        DATETIME_FROM_DEFAULT_TIME,
      ),
    ).toEqual({ ok: true, combined: "2026-07-27T14:30:00" });
    expect(
      apply_datetime_time_change(
        "2pm",
        "2026-07-27T00:00:00",
        DATETIME_FROM_DEFAULT_TIME,
      ).ok,
    ).toBe(false);
  });
});
