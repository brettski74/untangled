import { describe, expect, it } from "vitest";

import {
  display_field_value,
  format_datetime_local,
  iso_to_local_combined,
  local_datetime_control_parts,
} from "./format";

function local_datetime_text(iso: string): string {
  const ms = Date.parse(iso);
  const value = new Date(Math.round(ms / 1000) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

describe("format_datetime_local", () => {
  it("formats timezone-bearing ISO as local YYYY-MM-DD HH:MM:SS", () => {
    expect(format_datetime_local("2026-07-14T05:02:34Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34Z"),
    );
    expect(format_datetime_local("2026-07-14T06:02:34+01:00")).toBe(
      local_datetime_text("2026-07-14T06:02:34+01:00"),
    );
  });

  it("rounds fractional seconds to the nearest second", () => {
    expect(format_datetime_local("2026-07-14T05:02:34.400Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34.400Z"),
    );
    expect(format_datetime_local("2026-07-14T05:02:34.600Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34.600Z"),
    );
  });

  it("preserves timezone-free local datetime strings", () => {
    expect(format_datetime_local("2026-07-14T01:02:34")).toBe(
      "2026-07-14 01:02:34",
    );
    expect(format_datetime_local("2026-07-14 01:02")).toBe(
      "2026-07-14 01:02:00",
    );
  });

  it("returns null for empty or unparseable values", () => {
    expect(format_datetime_local("")).toBeNull();
    expect(format_datetime_local("not-a-date")).toBeNull();
    expect(format_datetime_local("2026-07-14T05:02:34Z-nope")).toBeNull();
  });
});

describe("display_field_value", () => {
  it("formats datetime by type metadata and empties invalid", () => {
    expect(display_field_value("datetime", "2026-07-14T05:02:34Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34Z"),
    );
    expect(display_field_value("datetime", null)).toBe("");
    expect(display_field_value("datetime", "bogus")).toBe("");
    expect(display_field_value("datetime", 12)).toBe("");
  });

  it("passes through non-datetime types", () => {
    expect(display_field_value("text", "hello")).toBe("hello");
    expect(display_field_value("boolean", true)).toBe("true");
    expect(display_field_value("integer", 3)).toBe("3");
  });
});

describe("local_datetime_control_parts", () => {
  it("splits a known UTC ISO into local date and time parts", () => {
    const expected = local_datetime_text("2026-07-14T05:02:34Z");
    const [date, time] = expected.split(" ");
    expect(local_datetime_control_parts("2026-07-14T05:02:34Z")).toEqual({
      date,
      time,
    });
  });

  it("rounds fractional seconds before splitting", () => {
    const expected = local_datetime_text("2026-07-14T05:02:34.600Z");
    const [date, time] = expected.split(" ");
    expect(local_datetime_control_parts("2026-07-14T05:02:34.600Z")).toEqual({
      date,
      time,
    });
  });

  it("returns empty parts for null, non-string, or unparseable values", () => {
    expect(local_datetime_control_parts(null)).toEqual({ date: "", time: "" });
    expect(local_datetime_control_parts(12)).toEqual({ date: "", time: "" });
    expect(local_datetime_control_parts("bogus")).toEqual({
      date: "",
      time: "",
    });
  });
});

describe("iso_to_local_combined", () => {
  it("builds local combined datetime from UTC ISO", () => {
    const parts = local_datetime_control_parts("2026-07-14T05:02:34Z");
    expect(iso_to_local_combined("2026-07-14T05:02:34Z")).toBe(
      `${parts.date}T${parts.time}`,
    );
  });

  it("returns empty for empty input", () => {
    expect(iso_to_local_combined("")).toBe("");
    expect(iso_to_local_combined("   ")).toBe("");
  });
});
