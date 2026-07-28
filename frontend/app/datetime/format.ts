/**
 * Local wall-time display for platform `datetime` values.
 * Defensive nearest-second rounding; empty for null/unparseable.
 */

export function format_datetime_local(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  if (has_timezone_suffix(trimmed)) {
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      return null;
    }
    return format_local_datetime_parts(new Date(Math.round(ms / 1000) * 1000));
  }
  const spaced = trimmed.includes("T") ? trimmed.replace("T", " ") : trimmed;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d+))?$/.exec(
      spaced,
    );
  if (match == null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] == null ? 0 : Number(match[6]);
  const frac = match[7];
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  let millis = 0;
  if (frac != null && frac !== "") {
    const padded = `${frac}000`.slice(0, 3);
    millis = Number(padded);
    if (!Number.isFinite(millis)) {
      return null;
    }
  }
  const local = new Date(year, month - 1, day, hour, minute, second, millis);
  if (Number.isNaN(local.getTime())) {
    return null;
  }
  return format_local_datetime_parts(new Date(Math.round(local.getTime() / 1000) * 1000));
}

/**
 * Metadata-driven display for list/detail field values.
 * Only formats when ``type_name`` is ``datetime``; other types return string forms.
 */
export function display_field_value(
  type_name: string,
  value: unknown,
): string {
  if (value == null) {
    return "";
  }
  if (type_name === "datetime") {
    if (typeof value !== "string") {
      return "";
    }
    return format_datetime_local(value) ?? "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Local date + time parts for dual-control chrome (detail / filters).
 * Empty for null, non-string, or unparseable values.
 */
export function local_datetime_control_parts(value: unknown): {
  date: string;
  time: string;
} {
  if (typeof value !== "string") {
    return { date: "", time: "" };
  }
  const formatted = format_datetime_local(value);
  if (formatted == null) {
    return { date: "", time: "" };
  }
  const space = formatted.indexOf(" ");
  if (space < 0) {
    return { date: "", time: "" };
  }
  return {
    date: formatted.slice(0, space),
    time: formatted.slice(space + 1),
  };
}

/**
 * Convert a UTC ISO (or known datetime) string to local ``YYYY-MM-DDTHH:mm:ss``.
 * Shared by filter editable chrome and detail read-only dual controls.
 */
export function iso_to_local_combined(iso: string): string {
  const trimmed = iso.trim();
  if (trimmed === "") {
    return "";
  }
  const parts = local_datetime_control_parts(trimmed);
  if (parts.date !== "") {
    return `${parts.date}T${parts.time}`;
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    return trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  }
  return "";
}

/**
 * Convert a local combined datetime string back to UTC ISO for the wire.
 */
export function local_combined_to_iso(combined: string): string | undefined {
  if (combined.trim() === "") {
    return undefined;
  }
  const ms = Date.parse(combined);
  if (Number.isNaN(ms)) {
    return combined;
  }
  return new Date(ms).toISOString();
}

function has_timezone_suffix(raw: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
}

function format_local_datetime_parts(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
