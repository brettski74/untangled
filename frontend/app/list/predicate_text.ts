/**
 * Shared human-readable rendering of search predicate ASTs for list filter text (#77).
 */
import type { AttributeFieldMeta } from "../generated/field_meta";
import { format_datetime_local } from "../datetime/format";
import { attribute_display_label } from "./columns";
import type { SearchPredicate } from "./quick_filter";

const STRING_FAMILY = new Set([
  "string",
  "compact_text",
  "choice",
  "status",
  "text",
  "multiline_text",
  "friendly_id",
  "uuid",
]);

/**
 * Render the last-applied effective predicate for the filter row.
 * Match-all (`null`) → empty string. Uses schema display names when provided.
 */
export function render_predicate_text(
  predicate: SearchPredicate | null | undefined,
  attributes: readonly AttributeFieldMeta[] = [],
): string {
  if (predicate == null) {
    return "";
  }
  const ctx = attribute_render_context(attributes);
  return render_node(predicate, ctx);
}

type AttrRenderCtx = {
  labels: Map<string, string>;
  types: Map<string, string>;
};

function attribute_render_context(
  attributes: readonly AttributeFieldMeta[],
): AttrRenderCtx {
  const labels = new Map<string, string>();
  const types = new Map<string, string>();
  for (const attr of attributes) {
    labels.set(attr.name_snake, attribute_display_label(attr.name_snake));
    types.set(attr.name_snake, attr.type_name);
  }
  return { labels, types };
}

function render_node(node: SearchPredicate, ctx: AttrRenderCtx): string {
  const op = node.op;
  switch (op) {
    case "and":
      return render_logical("&", node.predicates, ctx);
    case "or":
      return render_logical("|", node.predicates, ctx);
    case "not":
      return render_not(node.predicate, ctx);
    case "eq":
      return render_comparison("=", node, ctx);
    case "ne":
      return render_comparison("!=", node, ctx);
    case "gt":
      return render_comparison(">", node, ctx);
    case "gte":
      return render_comparison(">=", node, ctx);
    case "lt":
      return render_comparison("<", node, ctx);
    case "lte":
      return render_comparison("<=", node, ctx);
    case "regexp":
      return render_regexp(node, ctx);
    case "contains":
      return render_text_pattern("contains", node, ctx);
    case "ends_with":
      return render_text_pattern("ends_with", node, ctx);
    case "starts_with":
      return render_text_pattern("starts_with", node, ctx);
    case "empty":
      return `${attr_name(node.attribute, ctx)} is empty`;
    case "not_empty":
      return `${attr_name(node.attribute, ctx)} is not empty`;
    default:
      return "";
  }
}

function render_logical(
  joiner: "&" | "|",
  children: SearchPredicate[] | undefined,
  ctx: AttrRenderCtx,
): string {
  if (!Array.isArray(children) || children.length === 0) {
    return "";
  }
  const parts = children
    .map((child) => render_node(child, ctx))
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "";
  }
  return `( ${parts.join(` ${joiner} `)} )`;
}

function render_not(
  child: SearchPredicate | undefined,
  ctx: AttrRenderCtx,
): string {
  if (child == null) {
    return "";
  }
  const inner = render_node(child, ctx);
  if (inner === "") {
    return "";
  }
  return `!( ${inner} )`;
}

function render_comparison(
  symbol: string,
  node: SearchPredicate,
  ctx: AttrRenderCtx,
): string {
  const name = attr_name(node.attribute, ctx);
  if (name === "" || !("value" in node)) {
    return "";
  }
  const type_name =
    node.attribute != null ? (ctx.types.get(node.attribute) ?? null) : null;
  return `${name} ${symbol} ${format_predicate_value(node.value, type_name)}`;
}

function render_text_pattern(
  word: string,
  node: SearchPredicate,
  ctx: AttrRenderCtx,
): string {
  const name = attr_name(node.attribute, ctx);
  if (name === "" || typeof node.value !== "string") {
    return "";
  }
  return `${name} ${word} ${quote_string(node.value)}`;
}

function render_regexp(node: SearchPredicate, ctx: AttrRenderCtx): string {
  const name = attr_name(node.attribute, ctx);
  if (name === "" || typeof node.value !== "string") {
    return "";
  }
  return `${name} matches /${node.value}/`;
}

function attr_name(
  attribute: string | undefined,
  ctx: AttrRenderCtx,
): string {
  if (attribute == null || attribute === "") {
    return "";
  }
  return (
    ctx.labels.get(attribute) ??
    attribute_display_label(attribute)
  );
}

/**
 * Format a predicate value for filter text.
 * String-family → quoted wire token; numbers/bools bare;
 * datetimes → `YYYY-MM-DD HH:MM:SS` when parseable.
 */
export function format_predicate_value(
  value: unknown,
  type_name: string | null | undefined,
): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    if (type_name === "datetime" || looks_like_datetime(value)) {
      const human = format_datetime_text(value);
      if (human != null) {
        return human;
      }
    }
    if (type_name == null || STRING_FAMILY.has(type_name)) {
      return quote_string(value);
    }
    return quote_string(value);
  }
  if (value == null) {
    return "null";
  }
  return quote_string(JSON.stringify(value));
}

function quote_string(raw: string): string {
  return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function looks_like_datetime(raw: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) ||
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)
  );
}

/**
 * Stable human form `YYYY-MM-DD HH:MM:SS` from ISO or already-spaced local strings.
 */
export function format_datetime_text(raw: string): string | null {
  return format_datetime_local(raw);
}
