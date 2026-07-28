/**
 * Parse 24-hour time commit text for filter / quick-filter controls.
 *
 * Accepts digit-only shorthand (4/5/6 digits) and colon forms ``H:M`` / ``H:M:S``
 * with single-digit elements. Rejects other shapes and impossible components.
 */

const TIME_WARNING = "Enter time as 24-hour HH:mm:ss (e.g. 14:30:00).";

export function parse_time_24h(
  raw: string,
): { ok: true; time: string } | { ok: false; warning: string } {
  const t = raw.trim();
  if (t === "") {
    return { ok: false, warning: TIME_WARNING };
  }

  if (/^\d+$/.test(t)) {
    if (t.length === 6) {
      return pack_hms(
        Number(t.slice(0, 2)),
        Number(t.slice(2, 4)),
        Number(t.slice(4, 6)),
      );
    }
    if (t.length === 5) {
      return pack_hms(
        Number(t.slice(0, 1)),
        Number(t.slice(1, 3)),
        Number(t.slice(3, 5)),
      );
    }
    if (t.length === 4) {
      return pack_hms(Number(t.slice(0, 2)), Number(t.slice(2, 4)), 0);
    }
    return { ok: false, warning: TIME_WARNING };
  }

  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length === 3) {
      if (parts.some((p) => p === "" || !/^\d{1,2}$/.test(p))) {
        return { ok: false, warning: TIME_WARNING };
      }
      return pack_hms(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    if (parts.length === 2) {
      if (parts.some((p) => p === "" || !/^\d{1,2}$/.test(p))) {
        return { ok: false, warning: TIME_WARNING };
      }
      return pack_hms(Number(parts[0]), Number(parts[1]), 0);
    }
    return { ok: false, warning: TIME_WARNING };
  }

  return { ok: false, warning: TIME_WARNING };
}

function pack_hms(
  hour: number,
  minute: number,
  second: number,
): { ok: true; time: string } | { ok: false; warning: string } {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return { ok: false, warning: TIME_WARNING };
  }
  return {
    ok: true,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
  };
}
