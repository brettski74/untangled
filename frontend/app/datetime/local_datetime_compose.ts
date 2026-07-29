/**
 * Local date + time compose helpers for dual-control datetime chrome.
 * Shared by detail editable/read-only pairs and list filter editable pairs.
 */
import { parse_time_24h } from "./parse_time";

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
 * Combine date + time into a local datetime string.
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
  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(t)) {
    const parsed = parse_time_24h(t);
    return parsed.ok ? parsed.time : t;
  }
  return t;
}
