import { describe, expect, it } from "vitest";

import type { AttributeFieldMeta } from "../generated/field_meta";
import { list_destination_ui_sync } from "./list_destination_sync";

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

describe("list_destination_ui_sync", () => {
  const attributes = [
    attr({ name_snake: "number", type_name: "friendly_id", order: 0 }),
    attr({ name_snake: "risk_score", type_name: "integer", order: 1 }),
  ];

  it("resyncs search payload and resets quick-filter chrome together", () => {
    const sync = list_destination_ui_sync({
      rows: [{ id: "1", number: "CHG1" }],
      total: 1,
      limit: 20,
      offset: 0,
      effective_predicate: {
        op: "eq",
        attribute: "status",
        value: "in-progress",
      },
      attributes,
    });

    expect(sync.search).toEqual({
      rows: [{ id: "1", number: "CHG1" }],
      total: 1,
      limit: 20,
      offset: 0,
      effective_predicate: {
        op: "eq",
        attribute: "status",
        value: "in-progress",
      },
    });
    expect(sync.quick_filter).toEqual({
      selected_name: "number",
      values: {},
      warning: null,
      menu_open: false,
      copied: false,
    });
  });

  it("clears dirty quick-filter values even when default field name is unchanged", () => {
    const sync = list_destination_ui_sync({
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
      effective_predicate: null,
      attributes,
    });
    expect(sync.quick_filter.selected_name).toBe("number");
    expect(sync.quick_filter.values).toEqual({});
  });
});
