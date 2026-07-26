import { describe, expect, it } from "vitest";

import type { ClassFieldMeta } from "../generated/field_meta";
import {
  attribute_display_label,
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
  };
}

describe("list_display_columns", () => {
  it("preserves YAML order when there is no friendly-id", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "string",
            required: true,
            references: null,
          },
          {
            name_kebab: "status",
            name_snake: "status",
            type_name: "string",
            required: true,
            references: null,
          },
        ],
        null,
      ),
    );
    expect(columns.map((c) => c.name_snake)).toEqual(["summary", "status"]);
  });

  it("moves friendly-id left-most for display only", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "string",
            required: true,
            references: null,
          },
          {
            name_kebab: "number",
            name_snake: "number",
            type_name: "friendly-id",
            required: true,
            references: null,
          },
          {
            name_kebab: "status",
            name_snake: "status",
            type_name: "string",
            required: true,
            references: null,
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
  });

  it("leaves friendly-id in place when already first", () => {
    const columns = list_display_columns(
      sample_meta(
        [
          {
            name_kebab: "number",
            name_snake: "number",
            type_name: "friendly-id",
            required: true,
            references: null,
          },
          {
            name_kebab: "summary",
            name_snake: "summary",
            type_name: "string",
            required: true,
            references: null,
          },
        ],
        "number",
      ),
    );
    expect(columns.map((c) => c.name_snake)).toEqual(["number", "summary"]);
  });
});

describe("attribute_display_label", () => {
  it("humanizes kebab attribute names", () => {
    expect(attribute_display_label("assigned-user-id")).toBe("Assigned User Id");
    expect(attribute_display_label("number")).toBe("Number");
  });
});
