/**
 * Quick-filter predicate builders for list context bar (#76).
 * Wire vocabulary only — no new ops or relative-date semantics.
 */
import type { AttributeFieldMeta } from "../generated/field_meta";
import {
  DATETIME_FROM_DEFAULT_TIME,
  DATETIME_TO_DEFAULT_TIME,
} from "../datetime/local_datetime_compose";
import { parse_time_24h } from "../datetime/parse_time";
import { attributes_in_declaration_order } from "./columns";

export { parse_time_24h };

export type SearchPredicate = {
  op: string;
  attribute?: string;
  value?: unknown;
  predicates?: SearchPredicate[];
  predicate?: SearchPredicate;
};

export type QuickFilterControlKind =
  | "text"
  | "numeric"
  | "datetime"
  | "boolean"
  | "friendly_id";

export type QuickFilterValues = {
  text?: string;
  from?: string;
  to?: string;
  not?: boolean;
};

export type QuickFilterBuildResult =
  | { ok: true; predicates: SearchPredicate[] }
  | { ok: false; warning: string };

const TEXT_FAMILY = new Set([
  "string",
  "compact_text",
  "choice",
  "status",
  "text",
  "multiline_text",
]);

/**
 * Map attribute type to quick-filter control kind.
 * UUID attributes are unsupported (return null) — human ruling for #76.
 */
export function quick_filter_control_kind(
  type_name: string,
): QuickFilterControlKind | null {
  if (TEXT_FAMILY.has(type_name)) {
    return "text";
  }
  switch (type_name) {
    case "integer":
    case "float":
    case "decimal":
      return "numeric";
    case "datetime":
      return "datetime";
    case "boolean":
      return "boolean";
    case "friendly_id":
      return "friendly_id";
    default:
      return null;
  }
}

/**
 * Whether changing field should clear the row value (#77).
 * Keys off control kind (text family, numeric, etc.), not raw schema type_name.
 */
export function should_clear_value_on_field_change(
  prev_type: string | null,
  next_type: string | null,
): boolean {
  const prev_kind =
    prev_type == null ? null : quick_filter_control_kind(prev_type);
  const next_kind =
    next_type == null ? null : quick_filter_control_kind(next_type);
  return prev_kind !== next_kind;
}

/**
 * Attributes eligible for the quick-filter picker, in declaration ordinal order.
 * Fails closed via {@link attributes_in_declaration_order} when ordinals are missing.
 */
export function quick_filterable_attributes(
  attributes: readonly AttributeFieldMeta[],
): AttributeFieldMeta[] {
  return attributes_in_declaration_order(attributes).filter(
    (attr) => quick_filter_control_kind(attr.type_name) != null,
  );
}

/**
 * Default quick-filter chrome after mounting a list destination (or remount on nav).
 * First filterable attribute + empty values — independent of prior session edits.
 */
export function quick_filter_ui_defaults(
  attributes: readonly AttributeFieldMeta[],
): { selected_name: string; values: QuickFilterValues } {
  const filterable = quick_filterable_attributes(attributes);
  return {
    selected_name: filterable[0]?.name_snake ?? "",
    values: {},
  };
}

export type QuickFilterDestinationReset = {
  selected_name: string;
  values: QuickFilterValues;
  warning: string | null;
  menu_open: boolean;
  copied: boolean;
};

/**
 * Full chrome reset when the list destination identity changes (nav list switch).
 * Clears values even when the default attribute name is unchanged.
 */
export function quick_filter_destination_reset(
  attributes: readonly AttributeFieldMeta[],
): QuickFilterDestinationReset {
  const defaults = quick_filter_ui_defaults(attributes);
  return {
    selected_name: defaults.selected_name,
    values: defaults.values,
    warning: null,
    menu_open: false,
    copied: false,
  };
}

/**
 * AND comparison predicates onto an existing effective filter.
 * Flattens a top-level `and` on the left; otherwise wraps.
 */
export function and_predicates(
  left: SearchPredicate | null | undefined,
  ...additions: SearchPredicate[]
): SearchPredicate | null {
  const parts: SearchPredicate[] = [];
  if (left != null) {
    if (left.op === "and" && Array.isArray(left.predicates)) {
      parts.push(...left.predicates);
    } else {
      parts.push(left);
    }
  }
  for (const addition of additions) {
    parts.push(addition);
  }
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0] ?? null;
  }
  return { op: "and", predicates: parts };
}

/**
 * Build comparison predicate(s) for a quick-filter Enter submit.
 * Empty text/friendly_id/numeric/datetime values → empty predicates (no-op).
 * Boolean always emits `eq`.
 * Datetime To uses `lte` (PO: inclusive end-of-day with 23:59:59); numeric To uses `lt`.
 */
export function build_quick_filter_predicates(
  attr: AttributeFieldMeta,
  values: QuickFilterValues,
): QuickFilterBuildResult {
  const kind = quick_filter_control_kind(attr.type_name);
  if (kind == null) {
    return { ok: false, warning: "This attribute does not support quick filters." };
  }

  switch (kind) {
    case "text": {
      const text = values.text?.trim() ?? "";
      if (text === "") {
        return { ok: true, predicates: [] };
      }
      return {
        ok: true,
        predicates: [
          { op: "contains", attribute: attr.name_snake, value: text },
        ],
      };
    }
    case "friendly_id": {
      const text = values.text?.trim() ?? "";
      if (text === "") {
        return { ok: true, predicates: [] };
      }
      return {
        ok: true,
        predicates: [
          { op: "ends-with", attribute: attr.name_snake, value: text },
        ],
      };
    }
    case "boolean":
      return {
        ok: true,
        predicates: [
          {
            op: "eq",
            attribute: attr.name_snake,
            value: values.not === true ? false : true,
          },
        ],
      };
    case "numeric":
      return build_range_predicates(attr, values, parse_numeric, "lt");
    case "datetime":
      return build_range_predicates(attr, values, parse_datetime, "lte");
  }
}

/**
 * Quick-filter From/To side for a comparison op. Upper-bound ops default to
 * end-of-day; all other value-taking ops default to start-of-day. Also used by
 * the filter editor datetime value control.
 */
export function datetime_side_for_op(op: string): "from" | "to" {
  return op === "lt" || op === "lte" ? "to" : "from";
}

/** Default missing time for a comparison op in datetime value controls. */
export function datetime_default_time_for_op(op: string): string {
  return datetime_side_for_op(op) === "to"
    ? DATETIME_TO_DEFAULT_TIME
    : DATETIME_FROM_DEFAULT_TIME;
}

function build_range_predicates(
  attr: AttributeFieldMeta,
  values: QuickFilterValues,
  parse: (raw: string) => { ok: true; value: unknown } | { ok: false; warning: string },
  to_op: "lt" | "lte",
): QuickFilterBuildResult {
  const from_raw = values.from?.trim() ?? "";
  const to_raw = values.to?.trim() ?? "";
  if (from_raw === "" && to_raw === "") {
    return { ok: true, predicates: [] };
  }

  let from_value: unknown | undefined;
  let to_value: unknown | undefined;

  if (from_raw !== "") {
    const parsed = parse(from_raw);
    if (!parsed.ok) {
      return parsed;
    }
    from_value = parsed.value;
  }
  if (to_raw !== "") {
    const parsed = parse(to_raw);
    if (!parsed.ok) {
      return parsed;
    }
    to_value = parsed.value;
  }

  if (from_value !== undefined && to_value !== undefined) {
    if (compare_ordered(from_value, to_value) === 0) {
      return {
        ok: true,
        predicates: [
          { op: "eq", attribute: attr.name_snake, value: from_value },
        ],
      };
    }
    if (compare_ordered(from_value, to_value) > 0) {
      return {
        ok: false,
        warning: "From must be less than or equal to To.",
      };
    }
  }

  const predicates: SearchPredicate[] = [];
  if (from_value !== undefined) {
    predicates.push({
      op: "gte",
      attribute: attr.name_snake,
      value: from_value,
    });
  }
  if (to_value !== undefined) {
    predicates.push({
      op: to_op,
      attribute: attr.name_snake,
      value: to_value,
    });
  }
  return { ok: true, predicates };
}

function parse_numeric(
  raw: string,
): { ok: true; value: number } | { ok: false; warning: string } {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return { ok: false, warning: "Enter a valid number." };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, warning: "Enter a valid number." };
  }
  return { ok: true, value };
}

function parse_datetime(
  raw: string,
): { ok: true; value: string } | { ok: false; warning: string } {
  // Local combined values are `YYYY-MM-DDTHH:mm:ss` (or HH:mm); send ISO UTC.
  if (raw === "") {
    return { ok: false, warning: "Enter a valid date/time." };
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    return { ok: false, warning: "Enter a valid date/time." };
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

function compare_ordered(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return 0;
}

/**
 * Parse a predicate JSON form field. Invalid JSON → null (caller treats as match-all
 * only when explicitly empty; otherwise action should 400).
 */
export function parse_predicate_json(
  raw: FormDataEntryValue | null,
): { ok: true; predicate: SearchPredicate | null } | { ok: false } {
  if (raw == null || raw === "") {
    return { ok: true, predicate: null };
  }
  if (typeof raw !== "string") {
    return { ok: false };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) {
      return { ok: true, predicate: null };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, predicate: parsed as SearchPredicate };
  } catch {
    return { ok: false };
  }
}
