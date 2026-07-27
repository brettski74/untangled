/**
 * Quick-filter predicate builders for list context bar (#76).
 * Wire vocabulary only — no new ops or relative-date semantics.
 */
import type { AttributeFieldMeta } from "../generated/field_meta";
import { attributes_in_declaration_order } from "./columns";

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
  | "friendly-id";

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
  "compact-text",
  "choice",
  "status",
  "text",
  "multiline-text",
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
    case "friendly-id":
      return "friendly-id";
    default:
      return null;
  }
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
 * Empty text/friendly-id/numeric/datetime values → empty predicates (no-op).
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
    case "friendly-id": {
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

/** Default time when a From date is chosen (start of day, second resolution). */
export const DATETIME_FROM_DEFAULT_TIME = "00:00:00";

/** Default time when a To date is chosen (end of day, second resolution). */
export const DATETIME_TO_DEFAULT_TIME = "23:59:59";

/**
 * Split a stored local datetime (`YYYY-MM-DDTHH:mm[:ss]`) for date/time inputs.
 */
export function split_datetime_local(combined: string | undefined): {
  date: string;
  time: string;
} {
  const raw = combined?.trim() ?? "";
  if (raw === "") {
    return { date: "", time: "" };
  }
  const sep = raw.indexOf("T");
  if (sep < 0) {
    return { date: raw, time: "" };
  }
  return {
    date: raw.slice(0, sep),
    time: normalize_time_seconds(raw.slice(sep + 1)),
  };
}

/**
 * Combine date + time into a local datetime string for predicate building.
 * Empty date → "". Missing time uses `default_time`.
 */
export function combine_datetime_local(
  date: string,
  time: string,
  default_time: string,
): string {
  const d = date.trim();
  if (d === "") {
    return "";
  }
  const t = time.trim();
  return `${d}T${t === "" ? default_time : normalize_time_seconds(t)}`;
}

/**
 * Apply a date change for From/To: clears when date empty; otherwise defaults
 * time to start/end of day when no time is set yet.
 */
export function apply_datetime_date_change(
  side: "from" | "to",
  date: string,
  current_combined: string | undefined,
): string {
  const d = date.trim();
  if (d === "") {
    return "";
  }
  const { time } = split_datetime_local(current_combined);
  const default_time =
    side === "from" ? DATETIME_FROM_DEFAULT_TIME : DATETIME_TO_DEFAULT_TIME;
  return combine_datetime_local(d, time, default_time);
}

/**
 * Parse a 24-hour time string (`HH:mm` or `HH:mm:ss`). Empty → fail.
 * Native `<input type="time">` follows OS locale (often 12h); text fields use this.
 */
export function parse_time_24h(
  raw: string,
): { ok: true; time: string } | { ok: false; warning: string } {
  const t = raw.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (match == null) {
    return {
      ok: false,
      warning: "Enter time as 24-hour HH:mm:ss (e.g. 14:30:00).",
    };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] == null ? 0 : Number(match[3]);
  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return {
      ok: false,
      warning: "Enter time as 24-hour HH:mm:ss (e.g. 14:30:00).",
    };
  }
  return {
    ok: true,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
  };
}

/**
 * Apply a time change. Requires a date on that side. Validates 24h HH:mm[:ss].
 */
export function apply_datetime_time_change(
  time: string,
  current_combined: string | undefined,
  default_time: string,
): { ok: true; combined: string } | { ok: false; warning: string } {
  const { date } = split_datetime_local(current_combined);
  if (date === "") {
    return {
      ok: false,
      warning: "Pick a date first (time defaults when you choose a date).",
    };
  }
  const trimmed = time.trim();
  if (trimmed === "") {
    return {
      ok: true,
      combined: combine_datetime_local(date, "", default_time),
    };
  }
  const parsed = parse_time_24h(trimmed);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    combined: combine_datetime_local(date, parsed.time, default_time),
  };
}

function normalize_time_seconds(time: string): string {
  const t = time.trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const parsed = parse_time_24h(t);
    return parsed.ok ? parsed.time : `${t}:00`;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
    const parsed = parse_time_24h(t);
    return parsed.ok ? parsed.time : t;
  }
  return t;
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
