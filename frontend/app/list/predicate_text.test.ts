import { describe, expect, it } from "vitest";

import type { AttributeFieldMeta } from "../generated/field_meta";
import { format_datetime_text, render_predicate_text } from "./predicate_text";

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

const attrs = [
  attr({ name_snake: "status", type_name: "status", order: 0 }),
  attr({ name_snake: "summary", type_name: "text", order: 1 }),
  attr({ name_snake: "risk_score", type_name: "integer", order: 2 }),
  attr({ name_snake: "scheduled_start", type_name: "datetime", order: 3 }),
  attr({ name_snake: "number", type_name: "friendly-id", order: 4 }),
  attr({ name_snake: "description", type_name: "multiline-text", order: 5 }),
  attr({ name_snake: "active", type_name: "boolean", order: 6 }),
];

function local_datetime_text(iso: string): string {
  const ms = Date.parse(iso);
  const value = new Date(Math.round(ms / 1000) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

describe("render_predicate_text", () => {
  it("returns empty for match-all", () => {
    expect(render_predicate_text(null, attrs)).toBe("");
  });

  it("renders comparisons with display names and value forms", () => {
    expect(
      render_predicate_text(
        { op: "eq", attribute: "summary", value: "This is the summary" },
        attrs,
      ),
    ).toBe('Summary = "This is the summary"');
    expect(
      render_predicate_text(
        { op: "ne", attribute: "summary", value: 'say "hi"' },
        attrs,
      ),
    ).toBe('Summary != "say \\"hi\\""');
    expect(
      render_predicate_text(
        { op: "eq", attribute: "risk_score", value: 57 },
        attrs,
      ),
    ).toBe("Risk Score = 57");
    expect(
      render_predicate_text(
        { op: "gt", attribute: "risk_score", value: 57 },
        attrs,
      ),
    ).toBe("Risk Score > 57");
    expect(
      render_predicate_text(
        { op: "gte", attribute: "summary", value: "This" },
        attrs,
      ),
    ).toBe('Summary >= "This"');
    expect(
      render_predicate_text(
        { op: "lt", attribute: "risk_score", value: 10 },
        attrs,
      ),
    ).toBe("Risk Score < 10");
    expect(
      render_predicate_text(
        { op: "lte", attribute: "risk_score", value: 57 },
        attrs,
      ),
    ).toBe("Risk Score <= 57");
    expect(
      render_predicate_text(
        { op: "eq", attribute: "active", value: true },
        attrs,
      ),
    ).toBe("Active = true");
    expect(
      render_predicate_text(
        {
          op: "eq",
          attribute: "scheduled_start",
          value: "2026-07-14T01:02:03.000Z",
        },
        attrs,
      ),
    ).toBe(`Scheduled Start = ${local_datetime_text("2026-07-14T01:02:03.000Z")}`);
  });

  it("renders text-pattern and null-check ops", () => {
    expect(
      render_predicate_text(
        { op: "regexp", attribute: "summary", value: "^This.*summary$" },
        attrs,
      ),
    ).toBe("Summary matches /^This.*summary$/");
    expect(
      render_predicate_text(
        { op: "contains", attribute: "summary", value: "the" },
        attrs,
      ),
    ).toBe('Summary contains "the"');
    expect(
      render_predicate_text(
        { op: "ends-with", attribute: "number", value: "432" },
        attrs,
      ),
    ).toBe('Number ends-with "432"');
    expect(
      render_predicate_text(
        { op: "starts-with", attribute: "summary", value: "This" },
        attrs,
      ),
    ).toBe('Summary starts-with "This"');
    expect(
      render_predicate_text(
        { op: "empty", attribute: "description" },
        attrs,
      ),
    ).toBe("Description is empty");
    expect(
      render_predicate_text(
        { op: "not-empty", attribute: "description" },
        attrs,
      ),
    ).toBe("Description is not empty");
  });

  it("renders nested logical forms and not", () => {
    expect(
      render_predicate_text(
        {
          op: "and",
          predicates: [
            { op: "ne", attribute: "status", value: "closed" },
            { op: "ne", attribute: "status", value: "implemented" },
            { op: "ne", attribute: "status", value: "cancelled" },
          ],
        },
        attrs,
      ),
    ).toBe(
      '( Status != "closed" & Status != "implemented" & Status != "cancelled" )',
    );
    expect(
      render_predicate_text(
        {
          op: "or",
          predicates: [
            { op: "eq", attribute: "status", value: "resolved" },
            { op: "eq", attribute: "status", value: "closed" },
            { op: "eq", attribute: "status", value: "cancelled" },
          ],
        },
        attrs,
      ),
    ).toBe(
      '( Status = "resolved" | Status = "closed" | Status = "cancelled" )',
    );
    expect(
      render_predicate_text(
        {
          op: "not",
          predicate: { op: "eq", attribute: "status", value: "draft" },
        },
        attrs,
      ),
    ).toBe('!( Status = "draft" )');
  });

  it("uses wire status tokens not display labels", () => {
    expect(
      render_predicate_text(
        { op: "eq", attribute: "status", value: "resolved" },
        attrs,
      ),
    ).toBe('Status = "resolved"');
  });

  it("renders timezone-bearing datetime instants in local wall time", () => {
    expect(format_datetime_text("2026-07-14T05:02:34.000Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34.000Z"),
    );
    expect(format_datetime_text("2026-07-14T06:02:34+01:00")).toBe(
      local_datetime_text("2026-07-14T06:02:34+01:00"),
    );
  });

  it("rounds fractional seconds when formatting", () => {
    expect(format_datetime_text("2026-07-14T05:02:34.600Z")).toBe(
      local_datetime_text("2026-07-14T05:02:34.600Z"),
    );
  });

  it("preserves timezone-free local datetime strings", () => {
    expect(format_datetime_text("2026-07-14T01:02:34")).toBe(
      "2026-07-14 01:02:34",
    );
    expect(format_datetime_text("2026-07-14 01:02")).toBe(
      "2026-07-14 01:02:00",
    );
  });

  it("fails closed for invalid timezone-bearing datetime strings", () => {
    expect(
      render_predicate_text(
        {
          op: "eq",
          attribute: "scheduled_start",
          value: "2026-07-14T05:02:34Z-nope",
        },
        attrs,
      ),
    ).toBe('Scheduled Start = "2026-07-14T05:02:34Z-nope"');
  });
});
