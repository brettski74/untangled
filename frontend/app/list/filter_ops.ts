/**
 * Filter editor eligibility, operator labels, and draft-tree helpers (#77).
 */
import type { AttributeFieldMeta } from "../generated/field_meta";
import { attribute_display_label } from "./columns";
import {
  quick_filter_control_kind,
  type SearchPredicate,
} from "./quick_filter";

export const OPERATOR_DISPLAY_NAMES: Record<string, string> = {
  and: "And",
  or: "Or",
  eq: "Equals",
  ne: "Not equals",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  contains: "Contains",
  starts_with: "Starts with",
  ends_with: "Ends with",
  regexp: "Matches regexp",
  empty: "Is empty",
  not_empty: "Is not empty",
};

const TEXT_FAMILY = new Set([
  "string",
  "compact_text",
  "choice",
  "status",
  "text",
  "multiline_text",
]);

const ORDERED_TYPES = new Set([
  ...TEXT_FAMILY,
  "integer",
  "float",
  "decimal",
  "datetime",
  "friendly_id",
]);

const TEXT_PATTERN_TYPES = new Set([...TEXT_FAMILY, "friendly_id"]);

const NULL_CHECK_OPS = ["empty", "not_empty"] as const;
const NO_VALUE_OPS = new Set<string>(NULL_CHECK_OPS);

export type EditorLeaf = {
  id: string;
  kind: "leaf";
  attribute: string | null;
  op: string | null;
  value: unknown;
};

export type EditorGroup = {
  id: string;
  kind: "group";
  op: "and" | "or";
  children: EditorNode[];
};

export type EditorNode = EditorLeaf | EditorGroup;

export type EditorLoadResult =
  | { ok: true; root: EditorNode | null }
  | { ok: false; reason: "not" };

let next_editor_id = 1;

export function new_editor_id(): string {
  next_editor_id += 1;
  return `fe-${next_editor_id}`;
}

/** Reset id counter in tests. */
export function reset_editor_ids_for_tests(): void {
  next_editor_id = 1;
}

/**
 * Attributes eligible for the filter-editor Field drop-down.
 * Excludes FKs (`references != null`) and unsupported control types; sorted
 * lexicographically by display name (case-insensitive).
 */
export function editor_filterable_attributes(
  attributes: readonly AttributeFieldMeta[],
): AttributeFieldMeta[] {
  return attributes
    .filter(
      (attr) =>
        attr.references == null &&
        quick_filter_control_kind(attr.type_name) != null,
    )
    .sort((left, right) =>
      compare_display_name(
        attribute_display_label(left.name_kebab),
        attribute_display_label(right.name_kebab),
      ),
    );
}

export function operator_display_name(op: string): string {
  return OPERATOR_DISPLAY_NAMES[op] ?? op;
}

export function compare_display_name(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

/**
 * Leaf / empty-group ops valid for an attribute type (excludes and/or/not).
 */
export function leaf_ops_for_type(type_name: string): string[] {
  const ops = new Set<string>(["eq", "ne", "empty", "not_empty"]);
  if (ORDERED_TYPES.has(type_name)) {
    ops.add("gt");
    ops.add("gte");
    ops.add("lt");
    ops.add("lte");
  }
  if (TEXT_PATTERN_TYPES.has(type_name)) {
    ops.add("contains");
    ops.add("starts_with");
    ops.add("ends_with");
    ops.add("regexp");
  }
  return [...ops].sort((a, b) =>
    compare_display_name(operator_display_name(a), operator_display_name(b)),
  );
}

export function op_requires_value(op: string | null | undefined): boolean {
  if (op == null || op === "") {
    return true;
  }
  return !NO_VALUE_OPS.has(op);
}

/**
 * Eligible operators for a draft row, sorted by display name.
 * `parent_op` is the enclosing group op when this row is a child (or null at root).
 */
export function eligible_ops_for_row(args: {
  node: EditorNode;
  parent_op: "and" | "or" | null;
  attribute_type: string | null;
}): string[] {
  const { node, parent_op, attribute_type } = args;

  if (node.kind === "group") {
    if (node.children.length > 0) {
      const allowed: string[] = [];
      for (const candidate of ["and", "or"] as const) {
        if (would_create_same_op_nesting(candidate, node.children)) {
          continue;
        }
        allowed.push(candidate);
      }
      // Always keep current op selectable even if children would block a switch.
      if (!allowed.includes(node.op)) {
        allowed.push(node.op);
      }
      return allowed.sort((a, b) =>
        compare_display_name(operator_display_name(a), operator_display_name(b)),
      );
    }
    // Empty group shell: any leaf op + and/or (subject to parent same-op rule).
    return eligible_ops_for_empty_or_leaf({
      parent_op,
      attribute_type,
      include_logical: true,
    });
  }

  return eligible_ops_for_empty_or_leaf({
    parent_op,
    attribute_type,
    include_logical: true,
  });
}

function eligible_ops_for_empty_or_leaf(args: {
  parent_op: "and" | "or" | null;
  attribute_type: string | null;
  include_logical: boolean;
}): string[] {
  const ops = new Set<string>();
  if (args.attribute_type != null) {
    for (const op of leaf_ops_for_type(args.attribute_type)) {
      ops.add(op);
    }
  } else {
    // No field yet: offer comparison/null/text ops that appear once a field is chosen,
    // plus logical — use the union of common leaf ops without type gating beyond eq/ne/empty.
    for (const op of [
      "eq",
      "ne",
      "empty",
      "not_empty",
      "gt",
      "gte",
      "lt",
      "lte",
      "contains",
      "starts_with",
      "ends_with",
      "regexp",
    ]) {
      ops.add(op);
    }
  }
  if (args.include_logical) {
    if (args.parent_op !== "and") {
      ops.add("and");
    }
    if (args.parent_op !== "or") {
      ops.add("or");
    }
  }
  return [...ops].sort((a, b) =>
    compare_display_name(operator_display_name(a), operator_display_name(b)),
  );
}

function would_create_same_op_nesting(
  parent_op: "and" | "or",
  children: readonly EditorNode[],
): boolean {
  return children.some(
    (child) => child.kind === "group" && child.op === parent_op,
  );
}

export function predicate_contains_not(
  predicate: SearchPredicate | null | undefined,
): boolean {
  if (predicate == null) {
    return false;
  }
  if (predicate.op === "not") {
    return true;
  }
  if (Array.isArray(predicate.predicates)) {
    return predicate.predicates.some((child) => predicate_contains_not(child));
  }
  if (predicate.predicate != null) {
    return predicate_contains_not(predicate.predicate);
  }
  return false;
}

export function load_editor_from_predicate(
  predicate: SearchPredicate | null | undefined,
): EditorLoadResult {
  if (predicate == null) {
    return { ok: true, root: null };
  }
  if (predicate_contains_not(predicate)) {
    return { ok: false, reason: "not" };
  }
  return { ok: true, root: predicate_to_editor_node(predicate) };
}

function predicate_to_editor_node(predicate: SearchPredicate): EditorNode {
  if (predicate.op === "and" || predicate.op === "or") {
    const children = Array.isArray(predicate.predicates)
      ? predicate.predicates.map((child) => predicate_to_editor_node(child))
      : [];
    return {
      id: new_editor_id(),
      kind: "group",
      op: predicate.op,
      children,
    };
  }
  return {
    id: new_editor_id(),
    kind: "leaf",
    attribute: predicate.attribute ?? null,
    op: predicate.op,
    value: "value" in predicate ? predicate.value : undefined,
  };
}

export function empty_leaf(): EditorLeaf {
  return {
    id: new_editor_id(),
    kind: "leaf",
    attribute: null,
    op: null,
    value: undefined,
  };
}

/**
 * Convert a leaf to an and/or group wrapping the prior leaf as the sole child.
 */
export function wrap_leaf_as_group(
  leaf: EditorLeaf,
  op: "and" | "or",
): EditorGroup {
  return {
    id: new_editor_id(),
    kind: "group",
    op,
    children: [{ ...leaf, id: new_editor_id() }],
  };
}

/**
 * Apply an operator change on a node. Leaf → and/or wraps; group with no children
 * may become a leaf; group with children stays a group (and↔or only).
 */
export function apply_operator_change(
  node: EditorNode,
  next_op: string,
): EditorNode {
  if (next_op === "and" || next_op === "or") {
    if (node.kind === "leaf") {
      return wrap_leaf_as_group(node, next_op);
    }
    return { ...node, op: next_op };
  }

  if (node.kind === "group") {
    if (node.children.length > 0) {
      // Illegal for M1 when children present — caller should hide these ops.
      return node;
    }
    return {
      id: node.id,
      kind: "leaf",
      attribute: null,
      op: next_op,
      value: undefined,
    };
  }

  const cleared =
    op_requires_value(next_op) && !op_requires_value(node.op)
      ? undefined
      : !op_requires_value(next_op)
        ? undefined
        : node.value;
  return { ...node, op: next_op, value: cleared };
}

export type EditorCommitResult =
  | { ok: true; predicate: SearchPredicate | null }
  | { ok: false; message: string };

/**
 * Validate draft and build a wire predicate. Empty groups / incomplete leaves fail.
 */
export function commit_editor_root(root: EditorNode | null): EditorCommitResult {
  if (root == null) {
    return { ok: true, predicate: null };
  }
  try {
    return { ok: true, predicate: commit_node(root) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid filter.",
    };
  }
}

function commit_node(node: EditorNode): SearchPredicate {
  if (node.kind === "group") {
    if (node.children.length === 0) {
      throw new Error("Every And/Or group must have at least one condition.");
    }
    return {
      op: node.op,
      predicates: node.children.map((child) => commit_node(child)),
    };
  }
  if (node.attribute == null || node.attribute === "") {
    throw new Error("Every condition needs a field.");
  }
  if (node.op == null || node.op === "") {
    throw new Error("Every condition needs an operator.");
  }
  if (node.op === "and" || node.op === "or" || node.op === "not") {
    throw new Error("Invalid operator on a field condition.");
  }
  if (!op_requires_value(node.op)) {
    return { op: node.op, attribute: node.attribute };
  }
  if (node.value === undefined || node.value === "") {
    throw new Error("Every condition needs a value.");
  }
  return { op: node.op, attribute: node.attribute, value: node.value };
}

/**
 * Remove a node by id from a tree. Removing the root → null (match-all).
 */
export function remove_editor_node(
  root: EditorNode | null,
  target_id: string,
): EditorNode | null {
  if (root == null) {
    return null;
  }
  if (root.id === target_id) {
    return null;
  }
  if (root.kind === "leaf") {
    return root;
  }
  return {
    ...root,
    children: root.children
      .map((child) => remove_editor_node(child, target_id))
      .filter((child): child is EditorNode => child != null),
  };
}

export function append_group_child(
  root: EditorNode,
  group_id: string,
): EditorNode {
  if (root.kind === "leaf") {
    return root;
  }
  if (root.id === group_id) {
    return { ...root, children: [...root.children, empty_leaf()] };
  }
  return {
    ...root,
    children: root.children.map((child) => append_group_child(child, group_id)),
  };
}

export function update_editor_node(
  root: EditorNode,
  target_id: string,
  updater: (node: EditorNode) => EditorNode,
): EditorNode {
  if (root.id === target_id) {
    return updater(root);
  }
  if (root.kind === "leaf") {
    return root;
  }
  return {
    ...root,
    children: root.children.map((child) =>
      update_editor_node(child, target_id, updater),
    ),
  };
}

export function find_editor_node(
  root: EditorNode | null,
  target_id: string,
): EditorNode | null {
  if (root == null) {
    return null;
  }
  if (root.id === target_id) {
    return root;
  }
  if (root.kind === "group") {
    for (const child of root.children) {
      const found = find_editor_node(child, target_id);
      if (found != null) {
        return found;
      }
    }
  }
  return null;
}

export function parent_op_of(
  root: EditorNode | null,
  target_id: string,
): "and" | "or" | null {
  if (root == null) {
    return null;
  }
  return parent_op_of_walk(root, target_id, null);
}

function parent_op_of_walk(
  node: EditorNode,
  target_id: string,
  parent_op: "and" | "or" | null,
): "and" | "or" | null {
  if (node.id === target_id) {
    return parent_op;
  }
  if (node.kind !== "group") {
    return null;
  }
  for (const child of node.children) {
    const found = parent_op_of_walk(child, target_id, node.op);
    if (found != null || child.id === target_id) {
      return child.id === target_id ? node.op : found;
    }
  }
  return null;
}
