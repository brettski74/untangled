import { beforeEach, describe, expect, it } from "vitest";

import type { AttributeFieldMeta } from "../generated/field_meta";
import {
  apply_operator_change,
  commit_editor_root,
  editor_filterable_attributes,
  eligible_ops_for_row,
  empty_leaf,
  leaf_ops_for_type,
  load_editor_from_predicate,
  operator_display_name,
  parent_op_of,
  predicate_contains_not,
  remove_editor_node,
  reset_editor_ids_for_tests,
  wrap_leaf_as_group,
  type EditorLeaf,
} from "./filter_ops";

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

describe("editor_filterable_attributes", () => {
  it("excludes FKs and sorts lexicographically by display name", () => {
    const filtered = editor_filterable_attributes([
      attr({ name_snake: "summary", type_name: "text", order: 0 }),
      attr({
        name_snake: "assigned_user_id",
        type_name: "uuid",
        order: 1,
        references: "user",
      }),
      attr({ name_snake: "status", type_name: "status", order: 2 }),
      attr({ name_snake: "number", type_name: "friendly_id", order: 3 }),
      attr({ name_snake: "id", type_name: "uuid", order: 4 }),
    ]);
    expect(filtered.map((a) => a.name_snake)).toEqual([
      "number",
      "status",
      "summary",
    ]);
  });
});

describe("leaf_ops_for_type", () => {
  it("lists ops by display name and respects type eligibility", () => {
    const boolean_ops = leaf_ops_for_type("boolean");
    expect(boolean_ops).toEqual([
      "eq",
      "empty",
      "not-empty",
      "ne",
    ].sort((a, b) =>
      operator_display_name(a).localeCompare(operator_display_name(b), undefined, {
        sensitivity: "base",
      }),
    ));
    expect(boolean_ops).not.toContain("gt");
    expect(boolean_ops).not.toContain("contains");

    const text_ops = leaf_ops_for_type("text");
    expect(text_ops).toContain("contains");
    expect(text_ops).toContain("gt");
    expect(text_ops[0]).toBe("contains"); // Contains first alphabetically among labels
  });
});

describe("eligible_ops_for_row nesting", () => {
  beforeEach(() => {
    reset_editor_ids_for_tests();
  });

  it("hides and under and parent and or under or parent", () => {
    const leaf = empty_leaf();
    const under_and = eligible_ops_for_row({
      node: leaf,
      parent_op: "and",
      attribute_type: "text",
    });
    expect(under_and).not.toContain("and");
    expect(under_and).toContain("or");

    const under_or = eligible_ops_for_row({
      node: leaf,
      parent_op: "or",
      attribute_type: "text",
    });
    expect(under_or).not.toContain("or");
    expect(under_or).toContain("and");
  });

  it("blocks and↔or switch that would nest same-op with a direct child", () => {
    const group = {
      id: "g",
      kind: "group" as const,
      op: "or" as const,
      children: [
        {
          id: "c",
          kind: "group" as const,
          op: "and" as const,
          children: [empty_leaf()],
        },
      ],
    };
    const ops = eligible_ops_for_row({
      node: group,
      parent_op: null,
      attribute_type: null,
    });
    expect(ops).toContain("or");
    expect(ops).not.toContain("and");
  });
});

describe("editor tree mutations", () => {
  beforeEach(() => {
    reset_editor_ids_for_tests();
  });

  it("wraps leaf as group on and/or operator change", () => {
    const leaf: EditorLeaf = {
      id: "leaf",
      kind: "leaf",
      attribute: "status",
      op: "eq",
      value: "new",
    };
    const group = apply_operator_change(leaf, "and");
    expect(group.kind).toBe("group");
    if (group.kind !== "group") {
      return;
    }
    expect(group.op).toBe("and");
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toMatchObject({
      kind: "leaf",
      attribute: "status",
      op: "eq",
      value: "new",
    });
  });

  it("wrap_leaf_as_group preserves leaf payload", () => {
    const leaf = empty_leaf();
    leaf.attribute = "summary";
    leaf.op = "contains";
    leaf.value = "x";
    const group = wrap_leaf_as_group(leaf, "or");
    expect(group.children[0]).toMatchObject({
      attribute: "summary",
      op: "contains",
      value: "x",
    });
  });

  it("remove_editor_node clears root and prunes children", () => {
    const loaded = load_editor_from_predicate({
      op: "or",
      predicates: [
        { op: "eq", attribute: "status", value: "a" },
        { op: "eq", attribute: "status", value: "b" },
      ],
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || loaded.root == null || loaded.root.kind !== "group") {
      return;
    }
    const child_id = loaded.root.children[0]?.id;
    expect(child_id).toBeTruthy();
    const pruned = remove_editor_node(loaded.root, child_id!);
    expect(pruned?.kind).toBe("group");
    if (pruned?.kind === "group") {
      expect(pruned.children).toHaveLength(1);
    }
    expect(remove_editor_node(loaded.root, loaded.root.id)).toBeNull();
  });

  it("commit refuses empty groups and incomplete leaves", () => {
    expect(
      commit_editor_root({
        id: "g",
        kind: "group",
        op: "and",
        children: [],
      }),
    ).toEqual({
      ok: false,
      message: "Every And/Or group must have at least one condition.",
    });
    expect(commit_editor_root(empty_leaf())).toMatchObject({ ok: false });
    expect(
      commit_editor_root({
        id: "l",
        kind: "leaf",
        attribute: "status",
        op: "eq",
        value: "new",
      }),
    ).toEqual({
      ok: true,
      predicate: { op: "eq", attribute: "status", value: "new" },
    });
  });

  it("fail-closes load when tree contains not", () => {
    expect(predicate_contains_not({ op: "not", predicate: { op: "eq", attribute: "status", value: "x" } })).toBe(
      true,
    );
    expect(
      load_editor_from_predicate({
        op: "and",
        predicates: [
          {
            op: "not",
            predicate: { op: "eq", attribute: "status", value: "x" },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "not" });
  });

  it("parent_op_of reports enclosing group", () => {
    const loaded = load_editor_from_predicate({
      op: "and",
      predicates: [{ op: "eq", attribute: "status", value: "new" }],
    });
    if (!loaded.ok || loaded.root == null || loaded.root.kind !== "group") {
      throw new Error("expected group");
    }
    const child = loaded.root.children[0]!;
    expect(parent_op_of(loaded.root, child.id)).toBe("and");
    expect(parent_op_of(loaded.root, loaded.root.id)).toBeNull();
  });
});
