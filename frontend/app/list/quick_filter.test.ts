import { describe, expect, it } from "vitest";

import type { AttributeFieldMeta } from "../generated/field_meta";
import {
  and_predicates,
  build_quick_filter_predicates,
  parse_predicate_json,
  quick_filter_control_kind,
  quick_filterable_attributes,
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
