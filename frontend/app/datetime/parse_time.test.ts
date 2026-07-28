import { describe, expect, it } from "vitest";

import { parse_time_24h } from "./parse_time";

describe("parse_time_24h", () => {
  it("accepts digit-only shorthand of length 4, 5, and 6", () => {
    expect(parse_time_24h("123456")).toEqual({ ok: true, time: "12:34:56" });
    expect(parse_time_24h("12345")).toEqual({ ok: true, time: "01:23:45" });
    expect(parse_time_24h("1234")).toEqual({ ok: true, time: "12:34:00" });
  });

  it("rejects other digit-only lengths", () => {
    expect(parse_time_24h("123").ok).toBe(false);
    expect(parse_time_24h("1234567").ok).toBe(false);
    expect(parse_time_24h("1").ok).toBe(false);
  });

  it("accepts colon forms with single-digit elements", () => {
    expect(parse_time_24h("1:2:3")).toEqual({ ok: true, time: "01:02:03" });
    expect(parse_time_24h("12:34")).toEqual({ ok: true, time: "12:34:00" });
    expect(parse_time_24h("1:23")).toEqual({ ok: true, time: "01:23:00" });
    expect(parse_time_24h("9:05")).toEqual({ ok: true, time: "09:05:00" });
  });

  it("rejects invalid colon shapes and impossible components", () => {
    expect(parse_time_24h("12:").ok).toBe(false);
    expect(parse_time_24h(":30").ok).toBe(false);
    expect(parse_time_24h("1:2:3:4").ok).toBe(false);
    expect(parse_time_24h("24:00:00").ok).toBe(false);
    expect(parse_time_24h("12:60").ok).toBe(false);
    expect(parse_time_24h("2pm").ok).toBe(false);
    expect(parse_time_24h("").ok).toBe(false);
  });
});
