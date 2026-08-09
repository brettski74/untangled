import { describe, expect, it } from "vitest";

import type { ClassFieldMeta } from "../generated/field_meta";
import {
  attribute_display_label,
  attributes_in_declaration_order,
  list_display_columns,
} from "./columns";

function sample_meta(
  attributes: ClassFieldMeta["attributes"],
  friendly_id_attr: string | null,
): ClassFieldMeta {
  return {
    name_kebab: "sample",
    name_snake: "sample",
    display_name: "Sample",
    attributes,
    friendly_id_attr,
    display_attribute: null,
    public: false,
    suppress_create: false,
    suppress_delete: false,
    suppress_search: false,
  };
}

describe("list_display_columns", () => {
  it("preserves YAML order when there is no friendly_id", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "text",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_kebab: "status",
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
    expect(columns.map((c) => c.name_snake)).toEqual(["summary", "status"]);
  });

  it("moves friendly_id left-most for display only", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "text",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_kebab: "number",
            name_snake: "number",
            type_name: "friendly_id",
            required: true,
            references: null,
            order: 1,
          },
          {
            name_kebab: "status",
            name_snake: "status",
            type_name: "status",
            required: true,
            references: null,
            order: 2,
          },
        ],
        "number",
      ),
    );
    expect(columns.map((c) => c.name_snake)).toEqual([
      "number",
      "summary",
      "status",
    ]);
    expect(columns[0]?.is_friendly_id).toBe(true);
    expect(columns.map((c) => c.order)).toEqual([1, 0, 2]);
  });

  it("leaves friendly_id in place when already first", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "number",
            name_snake: "number",
            type_name: "friendly_id",
            required: true,
            references: null,
            order: 0,
          },
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "text",
            required: true,
            references: null,
            order: 1,
          },
        ],
        "number",
      ),
    );
    expect(columns.map((c) => c.name_snake)).toEqual(["number", "summary"]);
  });
});

describe("attributes_in_declaration_order", () => {
  it("sorts by order ordinal even when array is shuffled", () => {
    const sorted = attributes_in_declaration_order([
      {
        name_kebab: "status",
        name_snake: "status",
        type_name: "status",
        required: true,
        references: null,
        order: 1,
      },
      {
        name_kebab: "summary",
        name_snake: "summary",
        type_name: "text",
        required: true,
        references: null,
        order: 0,
      },
    ]);
    expect(sorted.map((a) => a.name_snake)).toEqual(["summary", "status"]);
  });

  it("fails closed when order is missing", () => {
    expect(() =>
      attributes_in_declaration_order([
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

describe("attribute_display_label", () => {
  it("humanizes kebab attribute names", () => {
    expect(attribute_display_label("assigned-user-id")).toBe("Assigned User Id");
    expect(attribute_display_label("number")).toBe("Number");
  });
});
