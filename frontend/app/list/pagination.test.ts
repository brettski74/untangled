import { describe, expect, it } from "vitest";

import {
  can_go_next,
  can_go_prev,
  clamp_starting_record,
  clamped_offset_for_total,
  DEFAULT_PER_PAGE,
  digits_only,
  is_per_page_option,
  last_page_start,
  offset_from_start,
  parse_paging_form_values,
  per_page_change_needs_refresh,
  start_from_offset,
  start_past_last_page,
  visible_row_count,
} from "./pagination";

describe("pagination mapping", () => {
  it("maps start ↔ offset", () => {
    expect(start_from_offset(0)).toBe(1);
    expect(start_from_offset(20)).toBe(21);
    expect(offset_from_start(1)).toBe(0);
    expect(offset_from_start(21)).toBe(20);
  });

  it("defaults and allowlists per-page options", () => {
    expect(DEFAULT_PER_PAGE).toBe(20);
    expect(is_per_page_option(20)).toBe(true);
    expect(is_per_page_option(15)).toBe(false);
    expect(is_per_page_option(200)).toBe(false);
  });
});

describe("last_page_start", () => {
  it("returns 1 for empty or non-positive totals", () => {
    expect(last_page_start(0, 20)).toBe(1);
    expect(last_page_start(-1, 20)).toBe(1);
  });

  it("lands on the final full page when total divides evenly", () => {
    expect(last_page_start(20, 20)).toBe(1);
    expect(last_page_start(40, 20)).toBe(21);
  });

  it("lands on the partial last page otherwise", () => {
    expect(last_page_start(21, 20)).toBe(21);
    expect(last_page_start(25, 10)).toBe(21);
  });
});

describe("disable rules", () => {
  it("disables prev on start 1", () => {
    expect(can_go_prev(1)).toBe(false);
    expect(can_go_prev(2)).toBe(true);
  });

  it("disables next/last when start > total − perPage", () => {
    expect(can_go_next(1, 20, 20)).toBe(false);
    expect(can_go_next(1, 25, 20)).toBe(true);
    expect(can_go_next(21, 25, 20)).toBe(false);
    expect(can_go_next(1, 0, 20)).toBe(false);
  });
});

describe("per_page_change_needs_refresh", () => {
  it("skips when both windows already cover through end of results", () => {
    expect(per_page_change_needs_refresh(1, 5, 20, 50)).toBe(false);
    expect(per_page_change_needs_refresh(1, 5, 10, 20)).toBe(false);
  });

  it("refreshes when the visible window would change", () => {
    expect(per_page_change_needs_refresh(1, 15, 20, 10)).toBe(true);
    expect(per_page_change_needs_refresh(21, 100, 20, 50)).toBe(true);
  });

  it("is false when per-page is unchanged", () => {
    expect(per_page_change_needs_refresh(1, 100, 20, 20)).toBe(false);
  });
});

describe("visible_row_count", () => {
  it("caps at remaining rows", () => {
    expect(visible_row_count(5, 0, 20)).toBe(5);
    expect(visible_row_count(100, 20, 20)).toBe(20);
    expect(visible_row_count(25, 20, 20)).toBe(5);
    expect(visible_row_count(10, 50, 20)).toBe(0);
  });
});

describe("clamp_starting_record", () => {
  it("coerces 0 and empty to 1", () => {
    expect(clamp_starting_record("0", 100, 20)).toBe(1);
    expect(clamp_starting_record("", 100, 20)).toBe(1);
    expect(clamp_starting_record(0, 100, 20)).toBe(1);
  });

  it("strips non-digits and clamps past last page", () => {
    expect(digits_only("12a3")).toBe("123");
    expect(clamp_starting_record("999", 25, 20)).toBe(21);
    expect(clamp_starting_record("21", 25, 20)).toBe(21);
  });
});

describe("start_past_last_page / clamp offset", () => {
  it("detects empty mid-page and clamps offset", () => {
    expect(start_past_last_page(40, 25, 20)).toBe(true);
    expect(clamped_offset_for_total(25, 20)).toBe(20);
    expect(start_past_last_page(0, 25, 20)).toBe(false);
    expect(start_past_last_page(0, 0, 20)).toBe(false);
  });
});

describe("parse_paging_form_values", () => {
  it("defaults when both omitted", () => {
    expect(parse_paging_form_values(null, null)).toEqual({
      ok: true,
      limit: 20,
      offset: 0,
    });
  });

  it("accepts allowlisted limit and non-negative offset", () => {
    expect(parse_paging_form_values("50", "20")).toEqual({
      ok: true,
      limit: 50,
      offset: 20,
    });
  });

  it("rejects disallowed limit and negative offset", () => {
    expect(parse_paging_form_values("15", "0")).toEqual({ ok: false });
    expect(parse_paging_form_values("20", "-1")).toEqual({ ok: false });
    expect(parse_paging_form_values("abc", "0")).toEqual({ ok: false });
    expect(parse_paging_form_values("20", "1.5")).toEqual({ ok: false });
  });
});
