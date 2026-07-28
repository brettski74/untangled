/**
 * Multi-column stable sort click rules for list headers (#78).
 * Wire type lives beside search_collection; this module owns the reducer only.
 */
import type { SearchSortSpec } from "../records/search.server";

export type ListSortSpec = SearchSortSpec;

export type ParseSortFormResult =
  | { ok: true; sort: ListSortSpec[] | null }
  | { ok: false };

/**
 * Parse optional FormData ``sort`` (key omitted ⇒ null / omit from API).
 * Malformed present values fail closed (400) — do not silently drop.
 */
export function parse_sort_form_value(
  raw: FormDataEntryValue | null,
): ParseSortFormResult {
  if (raw == null) {
    return { ok: true, sort: null };
  }
  if (typeof raw !== "string") {
    return { ok: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false };
  }
  const sort: ListSortSpec[] = [];
  for (const entry of parsed) {
    if (entry == null || typeof entry !== "object") {
      return { ok: false };
    }
    const attribute = (entry as { attribute?: unknown }).attribute;
    const direction = (entry as { direction?: unknown }).direction;
    if (typeof attribute !== "string" || attribute.length === 0) {
      return { ok: false };
    }
    if (direction !== "asc" && direction !== "desc") {
      return { ok: false };
    }
    if (sort.some((existing) => existing.attribute === attribute)) {
      return { ok: false };
    }
    sort.push({ attribute, direction });
  }
  return { ok: true, sort: sort.length === 0 ? null : sort };
}

/**
 * Apply a header-name click to the user sort list (epic #13 tri-state rules).
 *
 * - Unsorted / non-primary → become primary ascending (moved to front).
 * - Primary ascending → stay primary, switch to descending.
 * - Primary descending → remove; former second (if any) becomes primary.
 */
export function apply_sort_click(
  current: readonly ListSortSpec[],
  attribute: string,
): ListSortSpec[] {
  const primary = current[0];
  if (primary != null && primary.attribute === attribute) {
    if (primary.direction === "asc") {
      return [
        { attribute, direction: "desc" },
        ...current.slice(1),
      ];
    }
    return current.slice(1).map((entry) => ({ ...entry }));
  }

  const without = current.filter((entry) => entry.attribute !== attribute);
  return [{ attribute, direction: "asc" }, ...without];
}

/**
 * Accessible label fragment for a sorted column (primary-only Lucide icon).
 * Unsorted columns should omit this.
 */
export function sort_accessible_label(
  sort: readonly ListSortSpec[],
  attribute: string,
): string | null {
  const index = sort.findIndex((entry) => entry.attribute === attribute);
  if (index < 0) {
    return null;
  }
  const entry = sort[index];
  if (entry == null) {
    return null;
  }
  const direction = entry.direction === "asc" ? "ascending" : "descending";
  if (index === 0) {
    return `sorted ${direction}, primary`;
  }
  return `sorted ${direction}, ${index + 1} of ${sort.length}`;
}
