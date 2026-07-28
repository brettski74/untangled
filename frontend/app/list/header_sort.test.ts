import { describe, expect, it } from "vitest";

import {
  apply_sort_click,
  parse_sort_form_value,
  sort_accessible_label,
  type ListSortSpec,
} from "./header_sort";

describe("apply_sort_click", () => {
  it("makes an unsorted column primary ascending", () => {
    expect(apply_sort_click([], "summary")).toEqual([
      { attribute: "summary", direction: "asc" },
    ]);
  });

  it("toggles primary ascending to descending", () => {
    const current: ListSortSpec[] = [
      { attribute: "summary", direction: "asc" },
    ];
    expect(apply_sort_click(current, "summary")).toEqual([
      { attribute: "summary", direction: "desc" },
    ]);
  });

  it("removes primary when descending and promotes the former second", () => {
    const current: ListSortSpec[] = [
      { attribute: "summary", direction: "desc" },
      { attribute: "status", direction: "asc" },
      { attribute: "number", direction: "desc" },
    ];
    expect(apply_sort_click(current, "summary")).toEqual([
      { attribute: "status", direction: "asc" },
      { attribute: "number", direction: "desc" },
    ]);
  });

  it("clears sort when the sole primary is descending", () => {
    expect(
      apply_sort_click([{ attribute: "summary", direction: "desc" }], "summary"),
    ).toEqual([]);
  });

  it("promotes a secondary column to primary ascending", () => {
    const current: ListSortSpec[] = [
      { attribute: "summary", direction: "desc" },
      { attribute: "status", direction: "asc" },
    ];
    expect(apply_sort_click(current, "status")).toEqual([
      { attribute: "status", direction: "asc" },
      { attribute: "summary", direction: "desc" },
    ]);
  });

  it("inserts a new primary and keeps prior sorts as secondary", () => {
    const current: ListSortSpec[] = [
      { attribute: "summary", direction: "asc" },
    ];
    expect(apply_sort_click(current, "status")).toEqual([
      { attribute: "status", direction: "asc" },
      { attribute: "summary", direction: "asc" },
    ]);
  });

  it("does not mutate the input array", () => {
    const current: ListSortSpec[] = [
      { attribute: "summary", direction: "asc" },
    ];
    const freeze = Object.freeze([...current]);
    apply_sort_click(freeze, "summary");
    expect(freeze).toEqual([{ attribute: "summary", direction: "asc" }]);
  });
});

describe("sort_accessible_label", () => {
  const sort: ListSortSpec[] = [
    { attribute: "summary", direction: "asc" },
    { attribute: "status", direction: "desc" },
  ];

  it("labels the primary", () => {
    expect(sort_accessible_label(sort, "summary")).toBe(
      "sorted ascending, primary",
    );
  });

  it("labels secondary participation without implying aria-sort on it", () => {
    expect(sort_accessible_label(sort, "status")).toBe(
      "sorted descending, 2 of 2",
    );
  });

  it("returns null for unsorted columns", () => {
    expect(sort_accessible_label(sort, "number")).toBeNull();
  });
});

describe("parse_sort_form_value", () => {
  it("treats a missing key as omit", () => {
    expect(parse_sort_form_value(null)).toEqual({ ok: true, sort: null });
  });

  it("parses a non-empty sort list", () => {
    expect(
      parse_sort_form_value(
        JSON.stringify([{ attribute: "summary", direction: "desc" }]),
      ),
    ).toEqual({
      ok: true,
      sort: [{ attribute: "summary", direction: "desc" }],
    });
  });

  it("normalises an empty array to omit", () => {
    expect(parse_sort_form_value("[]")).toEqual({ ok: true, sort: null });
  });

  it("fails closed on malformed JSON or entries", () => {
    expect(parse_sort_form_value("{")).toEqual({ ok: false });
    expect(parse_sort_form_value('"summary"')).toEqual({ ok: false });
    expect(
      parse_sort_form_value(
        JSON.stringify([{ attribute: "summary", direction: "up" }]),
      ),
    ).toEqual({ ok: false });
    expect(
      parse_sort_form_value(
        JSON.stringify([
          { attribute: "summary", direction: "asc" },
          { attribute: "summary", direction: "desc" },
        ]),
      ),
    ).toEqual({ ok: false });
  });
});
