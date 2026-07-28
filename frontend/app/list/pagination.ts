/**
 * Offset-style list pagination helpers (#79 / epic #13).
 * Pure mapping between 1-based starting record + per-page and search offset/limit.
 */

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
export const DEFAULT_PER_PAGE: PerPageOption = 20;
export const DEFAULT_OFFSET = 0;

export type ParsePagingFormResult =
  | { ok: true; limit: number; offset: number }
  | { ok: false };

export function is_per_page_option(value: number): value is PerPageOption {
  return (PER_PAGE_OPTIONS as readonly number[]).includes(value);
}

/**
 * Grouped digits for the list total label.
 * Pass an explicit ``locales`` in tests; UI prefers browser languages when available,
 * otherwise the runtime default (``undefined``). Falls back if Intl rejects the tag.
 */
export function format_record_count(
  n: number,
  locales?: string | string[],
): string {
  try {
    return new Intl.NumberFormat(locales, { useGrouping: true }).format(n);
  } catch {
    try {
      return new Intl.NumberFormat(undefined, { useGrouping: true }).format(n);
    } catch {
      return String(n);
    }
  }
}

export function start_from_offset(offset: number): number {
  return offset + 1;
}

export function offset_from_start(start: number): number {
  return start - 1;
}

/**
 * Last-page starting record (1-based).
 * Uses floor((total - 1) / perPage) * perPage + 1 so exact multiples land on the
 * final full page (epic “floor(total/perPage)*perPage+1” overshoots when total
 * is divisible by perPage).
 */
export function last_page_start(total: number, per_page: number): number {
  if (total <= 0 || per_page < 1) {
    return 1;
  }
  return Math.floor((total - 1) / per_page) * per_page + 1;
}

export function can_go_prev(start: number): boolean {
  return start > 1;
}

/** Epic: disable next/last when start > total − perPage. */
export function can_go_next(
  start: number,
  total: number,
  per_page: number,
): boolean {
  return !(start > total - per_page);
}

export function visible_row_count(
  total: number,
  offset: number,
  limit: number,
): number {
  return Math.min(limit, Math.max(0, total - offset));
}

/**
 * True when changing per-page from the same start would change the returned window.
 */
export function per_page_change_needs_refresh(
  start: number,
  total: number,
  old_per_page: number,
  new_per_page: number,
): boolean {
  if (old_per_page === new_per_page) {
    return false;
  }
  const offset = offset_from_start(start);
  return (
    visible_row_count(total, offset, old_per_page) !==
    visible_row_count(total, offset, new_per_page)
  );
}

/**
 * Strip non-digits for the starting-record field while typing.
 */
export function digits_only(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Commit starting-record Enter: digits only, 0→1, clamp to last-page start.
 */
export function clamp_starting_record(
  raw: string | number,
  total: number,
  per_page: number,
): number {
  const digits =
    typeof raw === "number"
      ? String(Math.trunc(raw)).replace(/\D/g, "")
      : digits_only(raw);
  let start = digits.length === 0 ? 1 : Number.parseInt(digits, 10);
  if (!Number.isFinite(start) || start < 1) {
    start = 1;
  }
  const last = last_page_start(total, per_page);
  if (start > last) {
    return last;
  }
  return start;
}

/**
 * True when the response window starts past the last page (empty mid-page).
 * Caller should re-fetch with {@link clamped_offset_for_total}.
 */
export function start_past_last_page(
  offset: number,
  total: number,
  limit: number,
): boolean {
  const start = start_from_offset(offset);
  return start > last_page_start(total, limit);
}

export function clamped_offset_for_total(
  total: number,
  limit: number,
): number {
  return offset_from_start(last_page_start(total, limit));
}

/**
 * Parse optional FormData ``limit`` / ``offset``.
 * Missing either → defaults (20 / 0). Present but invalid → fail closed.
 */
export function parse_paging_form_values(
  limit_raw: FormDataEntryValue | null,
  offset_raw: FormDataEntryValue | null,
): ParsePagingFormResult {
  const limit =
    limit_raw == null
      ? DEFAULT_PER_PAGE
      : parse_int_field(limit_raw);
  if (limit == null || !is_per_page_option(limit)) {
    return { ok: false };
  }

  const offset =
    offset_raw == null ? DEFAULT_OFFSET : parse_int_field(offset_raw);
  if (offset == null || offset < 0) {
    return { ok: false };
  }

  return { ok: true, limit, offset };
}

function parse_int_field(raw: FormDataEntryValue): number | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (!/^-?\d+$/.test(raw)) {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}
