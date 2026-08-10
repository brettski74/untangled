import { describe, expect, it } from "vitest";

import type { ClassFieldMeta } from "../generated/field_meta";
import {
  partition_detail_layout,
  split_compact_columns,
} from "./default_layout";

function sample_meta(
  attributes: ClassFieldMeta["attributes"],
  friendly_id_attr: string | null = null,
): ClassFieldMeta {
  return {
    name_snake: "sample",
    display_name: "Sample",
    attributes,
    friendly_id_attr,
    display_attribute: null,
    public: false,
    permissions: ["create", "read", "search", "update", "delete"],
  };
}

describe("partition_detail_layout", () => {
  it("L1: puts text and multiline_text in the text section in declaration order", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "summary",
            type_name: "text",
            required: true,
            references: null,
            order: 1,
          },
          {
            name_snake: "description",
            type_name: "multiline_text",
            required: false,
            references: null,
            order: 2,
          },
        ],
        null,
      ),
    );
    expect(layout.text.map((s) => s.name_snake)).toEqual([
      "summary",
      "description",
    ]);
    expect(layout.compact.map((s) => s.name_snake)).toEqual([
      "status",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ]);
  });

  it("L2: leaves text section empty when there are no text types", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "severity",
            type_name: "choice",
            required: true,
            references: null,
            order: 1,
          },
        ],
        null,
      ),
    );
    expect(layout.text).toEqual([]);
    expect(layout.compact.map((s) => s.name_snake).slice(0, 2)).toEqual([
      "status",
      "severity",
    ]);
  });

  it("L3: pins friendly_id top-left; other compact keep declaration order", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "number",
            type_name: "friendly_id",
            required: true,
            references: null,
            order: 1,
          },
          {
            name_snake: "severity",
            type_name: "choice",
            required: true,
            references: null,
            order: 2,
          },
        ],
        "number",
      ),
    );
    expect(layout.compact[0]?.name_snake).toBe("number");
    expect(layout.compact[0]?.kind).toBe("friendly_id");
    expect(layout.compact.map((s) => s.name_snake).slice(0, 3)).toEqual([
      "number",
      "status",
      "severity",
    ]);
  });

  it("L4: without friendly_id, compact starts with first non-text author attr", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "summary",
            type_name: "text",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 1,
          },
        ],
        null,
      ),
    );
    expect(layout.compact[0]?.name_snake).toBe("status");
  });

  it("L5: appends audit fields in fixed platform order", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 0,
          },
        ],
        null,
      ),
    );
    expect(layout.compact.map((s) => s.name_snake)).toEqual([
      "status",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ]);
    expect(layout.compact.filter((s) => s.kind === "audit")).toHaveLength(4);
  });

  it("L6: never includes id in compact or text slots", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "id",
            type_name: "uuid",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 1,
          },
        ],
        null,
      ),
    );
    expect(layout.compact.some((s) => s.name_snake === "id")).toBe(false);
    expect(layout.text.some((s) => s.name_snake === "id")).toBe(false);
  });

  it("L7: splits compact left-then-right with ceil(n/2) rows", () => {
    const slots = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "a",
            type_name: "status",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_snake: "b",
            type_name: "choice",
            required: true,
            references: null,
            order: 1,
          },
          {
            name_snake: "c",
            type_name: "integer",
            required: false,
            references: null,
            order: 2,
          },
        ],
        null,
      ),
    ).compact;
    const { left, right } = split_compact_columns(slots);
    expect(left.length + right.length).toBe(slots.length);
    expect(left.length).toBe(Math.ceil(slots.length / 2));
    expect([...left, ...right].map((s) => s.name_snake)).toEqual(
      slots.map((s) => s.name_snake),
    );
  });

  it("L8: fails closed when declaration order is missing", () => {
    expect(() =>
      partition_detail_layout(
        sample_meta(
          [
            {
              name_snake: "status",
              type_name: "status",
              required: true,
              references: null,
              order: Number.NaN,
            },
          ],
          null,
        ),
      ),
    ).toThrow(/declaration order/);
  });

  it("L9: treats string, choice, and status as compact", () => {
    const layout = partition_detail_layout(
      sample_meta(
        [
          {
            name_snake: "legacy",
            type_name: "string",
            required: false,
            references: null,
            order: 0,
          },
          {
            name_snake: "severity",
            type_name: "choice",
            required: true,
            references: null,
            order: 1,
          },
          {
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 2,
          },
        ],
        null,
      ),
    );
    expect(layout.text).toEqual([]);
    expect(layout.compact.map((s) => s.name_snake).slice(0, 3)).toEqual([
      "legacy",
      "severity",
      "status",
    ]);
  });
});
