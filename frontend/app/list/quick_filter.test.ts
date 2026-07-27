import { describe, expect, it } from "vitest";

import type { AttributeFieldMeta } from "../generated/field_meta";
import {
  and_predicates,
  apply_datetime_date_change,
  apply_datetime_time_change,
  build_quick_filter_predicates,
  combine_datetime_local,
  DATETIME_FROM_DEFAULT_TIME,
  DATETIME_TO_DEFAULT_TIME,
  parse_predicate_json,
  parse_time_24h,
  quick_filter_control_kind,
  quick_filter_destination_reset,
  quick_filter_ui_defaults,
  quick_filterable_attributes,
  split_datetime_local,
} from "./quick_filter";

function attr(
  overrides: Partial<AttributeFieldMeta> &
    Pick<AttributeFieldMeta, "name_snake" | "type_name" | "order">,
): AttributeFieldMeta {
  return {
    name_kebab: overrides.name_kebab ?? overrides.name_snake.replace(/_/g, "-"),
    name_snake: overrides.name_snake,
    type_name: overrides.type_name,
    required: overrides.required ?? false,
    references: overrides.references ?? null,
    order: overrides.order,
  };
}

describe("quick_filter_control_kind", () => {
  it("maps text family, numeric, datetime, boolean, friendly-id", () => {
    expect(quick_filter_control_kind("text")).toBe("text");
    expect(quick_filter_control_kind("compact-text")).toBe("text");
    expect(quick_filter_control_kind("choice")).toBe("text");
    expect(quick_filter_control_kind("status")).toBe("text");
    expect(quick_filter_control_kind("integer")).toBe("numeric");
    expect(quick_filter_control_kind("datetime")).toBe("datetime");
    expect(quick_filter_control_kind("boolean")).toBe("boolean");
    expect(quick_filter_control_kind("friendly-id")).toBe("friendly-id");
  });

  it("rejects uuid and unknown types", () => {
    expect(quick_filter_control_kind("uuid")).toBeNull();
    expect(quick_filter_control_kind("mystery")).toBeNull();
  });
});

describe("quick_filterable_attributes", () => {
  it("orders by ordinal and excludes uuid", () => {
    const filtered = quick_filterable_attributes([
      attr({ name_snake: "assigned_user_id", type_name: "uuid", order: 2 }),
      attr({ name_snake: "status", type_name: "status", order: 1 }),
      attr({ name_snake: "summary", type_name: "text", order: 0 }),
    ]);
    expect(filtered.map((a) => a.name_snake)).toEqual(["summary", "status"]);
  });

  it("fails closed when declaration ordinals are missing", () => {
    expect(() =>
      quick_filterable_attributes([
        {
          name_kebab: "summary",
          name_snake: "summary",
          type_name: "text",
          required: true,
          references: null,
          order: undefined as unknown as number,
        },
      ]),
    ).toThrow(/missing a valid declaration order ordinal/);
  });
});

describe("quick_filter_ui_defaults", () => {
  const incidentish = [
    attr({ name_snake: "number", type_name: "friendly-id", order: 0 }),
    attr({ name_snake: "summary", type_name: "text", order: 1 }),
    attr({ name_snake: "status", type_name: "status", order: 2 }),
  ];

  it("selects the first filterable attribute with empty values", () => {
    expect(quick_filter_ui_defaults(incidentish)).toEqual({
      selected_name: "number",
      values: {},
    });
  });

  it("clears values even when the default attribute name is unchanged", () => {
    // Same-class nav options share the same first filterable field; remount /
    // defaults must still wipe typed values, not only change selected_name.
    const dirty = { selected_name: "summary", values: { text: "outage" } };
    const reset = quick_filter_ui_defaults(incidentish);
    expect(reset.selected_name).toBe("number");
    expect(reset.values).toEqual({});
    expect(reset).not.toMatchObject(dirty);
  });
});

describe("quick_filter_destination_reset", () => {
  const change_requestish = [
    attr({ name_snake: "number", type_name: "friendly-id", order: 0 }),
    attr({ name_snake: "risk_score", type_name: "integer", order: 1 }),
    attr({ name_snake: "summary", type_name: "text", order: 2 }),
  ];

  it("resets field, values, and ephemeral chrome for a new destination", () => {
    expect(quick_filter_destination_reset(change_requestish)).toEqual({
      selected_name: "number",
      values: {},
      warning: null,
      menu_open: false,
      copied: false,
    });
  });

  it("clears dirty values when the default attribute name is unchanged", () => {
    const dirty = {
      selected_name: "risk_score",
      values: { from: "55" },
      warning: "From must be ≤ To",
      menu_open: true,
      copied: true,
    };
    const reset = quick_filter_destination_reset(change_requestish);
    expect(reset.selected_name).toBe("number");
    expect(reset.values).toEqual({});
    expect(reset.warning).toBeNull();
    expect(reset.menu_open).toBe(false);
    expect(reset.copied).toBe(false);
    expect(reset).not.toMatchObject(dirty);
  });
});

describe("and_predicates", () => {
  it("returns null when empty", () => {
    expect(and_predicates(null)).toBeNull();
  });

  it("returns a single side unchanged", () => {
    const left = { op: "eq", attribute: "status", value: "new" };
    expect(and_predicates(left)).toEqual(left);
    expect(and_predicates(null, left)).toEqual(left);
  });

  it("flattens left and and wraps otherwise", () => {
    const baseline = {
      op: "and",
      predicates: [
        { op: "ne", attribute: "status", value: "closed" },
        { op: "ne", attribute: "status", value: "resolved" },
      ],
    };
    const added = { op: "contains", attribute: "summary", value: "outage" };
    expect(and_predicates(baseline, added)).toEqual({
      op: "and",
      predicates: [...baseline.predicates, added],
    });

    const single = { op: "eq", attribute: "status", value: "new" };
    expect(and_predicates(single, added)).toEqual({
      op: "and",
      predicates: [single, added],
    });
  });
});

describe("build_quick_filter_predicates", () => {
  it("builds contains for text and ends-with for friendly-id", () => {
    expect(
      build_quick_filter_predicates(
        attr({ name_snake: "summary", type_name: "text", order: 0 }),
        { text: " outage " },
      ),
    ).toEqual({
      ok: true,
      predicates: [
        { op: "contains", attribute: "summary", value: "outage" },
      ],
    });
    expect(
      build_quick_filter_predicates(
        attr({ name_snake: "number", type_name: "friendly-id", order: 0 }),
        { text: "0001" },
      ),
    ).toEqual({
      ok: true,
      predicates: [
        { op: "ends-with", attribute: "number", value: "0001" },
      ],
    });
  });

  it("no-ops on empty text", () => {
    expect(
      build_quick_filter_predicates(
        attr({ name_snake: "summary", type_name: "text", order: 0 }),
        { text: "  " },
      ),
    ).toEqual({ ok: true, predicates: [] });
  });

  it("emits boolean eq for Not checked/unchecked", () => {
    const field = attr({
      name_snake: "major_incident",
      type_name: "boolean",
      order: 0,
    });
    expect(build_quick_filter_predicates(field, { not: false })).toEqual({
      ok: true,
      predicates: [
        { op: "eq", attribute: "major_incident", value: true },
      ],
    });
    expect(build_quick_filter_predicates(field, { not: true })).toEqual({
      ok: true,
      predicates: [
        { op: "eq", attribute: "major_incident", value: false },
      ],
    });
  });

  it("handles numeric eq, gte/lt, and From>To warning", () => {
    const field = attr({
      name_snake: "risk_score",
      type_name: "integer",
      order: 0,
    });
    expect(
      build_quick_filter_predicates(field, { from: "5", to: "5" }),
    ).toEqual({
      ok: true,
      predicates: [{ op: "eq", attribute: "risk_score", value: 5 }],
    });
    expect(
      build_quick_filter_predicates(field, { from: "1", to: "10" }),
    ).toEqual({
      ok: true,
      predicates: [
        { op: "gte", attribute: "risk_score", value: 1 },
        { op: "lt", attribute: "risk_score", value: 10 },
      ],
    });
    expect(
      build_quick_filter_predicates(field, { from: "10", to: "1" }),
    ).toEqual({
      ok: false,
      warning: "From must be less than or equal to To.",
    });
    expect(build_quick_filter_predicates(field, {})).toEqual({
      ok: true,
      predicates: [],
    });
  });

  it("uses lte for datetime To and allows From-only or To-only", () => {
    const field = attr({
      name_snake: "scheduled_start",
      type_name: "datetime",
      order: 0,
    });
    expect(build_quick_filter_predicates(field, {})).toEqual({
      ok: true,
      predicates: [],
    });

    const from_only = build_quick_filter_predicates(field, {
      from: "2026-07-27T00:00:00",
    });
    expect(from_only.ok).toBe(true);
    if (from_only.ok) {
      expect(from_only.predicates).toHaveLength(1);
      expect(from_only.predicates[0]).toMatchObject({
        op: "gte",
        attribute: "scheduled_start",
      });
    }

    const to_only = build_quick_filter_predicates(field, {
      to: "2026-07-27T23:59:59",
    });
    expect(to_only.ok).toBe(true);
    if (to_only.ok) {
      expect(to_only.predicates).toHaveLength(1);
      expect(to_only.predicates[0]).toMatchObject({
        op: "lte",
        attribute: "scheduled_start",
      });
    }
  });

  it("rejects uuid attributes", () => {
    expect(
      build_quick_filter_predicates(
        attr({ name_snake: "assigned_user_id", type_name: "uuid", order: 0 }),
        { text: "anything" },
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("datetime local split/combine", () => {
  it("defaults From to 00:00:00 and To to 23:59:59 on date select", () => {
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

  it("rejects time changes without a date", () => {
    expect(
      apply_datetime_time_change(
        "12:00:00",
        undefined,
        DATETIME_FROM_DEFAULT_TIME,
      ),
    ).toEqual({
      ok: false,
      warning: "Pick a date first (time defaults when you choose a date).",
    });
  });

  it("round-trips split and combine with second resolution", () => {
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
});

describe("24-hour time parsing", () => {
  it("accepts HH:mm and HH:mm:ss in 0–23 hours", () => {
    expect(parse_time_24h("14:30")).toEqual({ ok: true, time: "14:30:00" });
    expect(parse_time_24h("14:30:45")).toEqual({ ok: true, time: "14:30:45" });
    expect(parse_time_24h("0:00:00")).toEqual({ ok: true, time: "00:00:00" });
    expect(parse_time_24h("23:59:59")).toEqual({ ok: true, time: "23:59:59" });
  });

  it("rejects invalid or 12-hour style values", () => {
    expect(parse_time_24h("24:00:00").ok).toBe(false);
    expect(parse_time_24h("12:60").ok).toBe(false);
    expect(parse_time_24h("2pm").ok).toBe(false);
    expect(parse_time_24h("").ok).toBe(false);
  });

  it("apply_datetime_time_change validates and normalizes", () => {
    expect(
      apply_datetime_time_change(
        "9:05",
        "2026-07-27T00:00:00",
        DATETIME_FROM_DEFAULT_TIME,
      ),
    ).toEqual({ ok: true, combined: "2026-07-27T09:05:00" });
    expect(
      apply_datetime_time_change(
        "25:00",
        "2026-07-27T00:00:00",
        DATETIME_FROM_DEFAULT_TIME,
      ).ok,
    ).toBe(false);
  });
});

describe("parse_predicate_json", () => {
  it("parses null, empty, and objects", () => {
    expect(parse_predicate_json(null)).toEqual({
      ok: true,
      predicate: null,
    });
    expect(parse_predicate_json("")).toEqual({ ok: true, predicate: null });
    expect(parse_predicate_json("null")).toEqual({
      ok: true,
      predicate: null,
    });
    expect(
      parse_predicate_json(
        JSON.stringify({ op: "eq", attribute: "status", value: "new" }),
      ),
    ).toEqual({
      ok: true,
      predicate: { op: "eq", attribute: "status", value: "new" },
    });
  });

  it("fails closed on invalid JSON", () => {
    expect(parse_predicate_json("{")).toEqual({ ok: false });
    expect(parse_predicate_json("[]")).toEqual({ ok: false });
  });
});
