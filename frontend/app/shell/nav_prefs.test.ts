import { describe, expect, it } from "vitest";

import {
  NAV_COLLAPSED_WIDTH_PX,
  NAV_DEFAULT_WIDTH_PX,
  NAV_NARROW_BREAKPOINT_PX,
  NAV_WIDTH_MAX_PX,
  NAV_WIDTH_MIN_PX,
  clamp_nav_width,
  default_nav_prefs,
  effective_nav_width,
  parse_nav_prefs,
  read_nav_prefs,
  serialize_nav_prefs,
  write_nav_prefs,
} from "./nav_prefs";

describe("clamp_nav_width", () => {
  it("clamps to min and max", () => {
    expect(clamp_nav_width(50)).toBe(NAV_WIDTH_MIN_PX);
    expect(clamp_nav_width(500)).toBe(NAV_WIDTH_MAX_PX);
    expect(clamp_nav_width(180)).toBe(180);
  });

  it("rounds and rejects non-finite", () => {
    expect(clamp_nav_width(180.7)).toBe(181);
    expect(clamp_nav_width(Number.NaN)).toBe(NAV_DEFAULT_WIDTH_PX);
  });
});

describe("parse_nav_prefs / serialize_nav_prefs", () => {
  it("round-trips valid prefs", () => {
    const prefs = { collapsed: true, last_expanded_width: 200 };
    expect(parse_nav_prefs(serialize_nav_prefs(prefs))).toEqual(prefs);
  });

  it("returns null for junk", () => {
    expect(parse_nav_prefs(null)).toBeNull();
    expect(parse_nav_prefs("")).toBeNull();
    expect(parse_nav_prefs("{")).toBeNull();
    expect(parse_nav_prefs(JSON.stringify({ collapsed: "yes" }))).toBeNull();
    expect(
      parse_nav_prefs(JSON.stringify({ collapsed: false, last_expanded_width: "x" })),
    ).toBeNull();
  });

  it("clamps width on parse", () => {
    expect(
      parse_nav_prefs(
        JSON.stringify({ collapsed: false, last_expanded_width: 999 }),
      ),
    ).toEqual({ collapsed: false, last_expanded_width: NAV_WIDTH_MAX_PX });
  });
});

describe("default_nav_prefs", () => {
  it("starts collapsed below the narrow breakpoint", () => {
    expect(default_nav_prefs(NAV_NARROW_BREAKPOINT_PX - 1).collapsed).toBe(true);
    expect(default_nav_prefs(NAV_NARROW_BREAKPOINT_PX).collapsed).toBe(false);
  });
});

describe("effective_nav_width", () => {
  it("uses collapsed width or last expanded width", () => {
    expect(
      effective_nav_width({ collapsed: true, last_expanded_width: 200 }),
    ).toBe(NAV_COLLAPSED_WIDTH_PX);
    expect(
      effective_nav_width({ collapsed: false, last_expanded_width: 200 }),
    ).toBe(200);
  });
});

describe("read_nav_prefs / write_nav_prefs", () => {
  it("reads stored prefs and falls back to defaults", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    expect(read_nav_prefs(storage, 1400)).toEqual({
      collapsed: false,
      last_expanded_width: NAV_DEFAULT_WIDTH_PX,
    });

    write_nav_prefs(storage, {
      collapsed: true,
      last_expanded_width: 160,
    });
    expect(read_nav_prefs(storage, 1400)).toEqual({
      collapsed: true,
      last_expanded_width: 160,
    });
  });
});
