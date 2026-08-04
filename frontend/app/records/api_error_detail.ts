/**
 * Format domain API error payloads for create/detail save banners.
 */
export function format_api_error_detail(
  payload: unknown,
  fallback: string,
): string {
  if (payload == null || typeof payload !== "object" || !("detail" in payload)) {
    return fallback;
  }
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }
  if (!Array.isArray(detail)) {
    return fallback;
  }
  const parts = detail
    .map((item) => {
      if (item == null || typeof item !== "object") {
        return null;
      }
      const row = item as { loc?: unknown; msg?: unknown };
      const msg = typeof row.msg === "string" ? row.msg : null;
      if (msg == null || msg.length === 0) {
        return null;
      }
      // Strip Pydantic v2 "Value error, " prefix when present.
      const message = msg.startsWith("Value error, ")
        ? msg.slice("Value error, ".length)
        : msg;
      const loc = Array.isArray(row.loc) ? row.loc : [];
      const path = loc
        .map((segment) => String(segment))
        .filter((segment) => segment.length > 0 && segment !== "body")
        .join(".");
      return path.length > 0 ? `${path}: ${message}` : message;
    })
    .filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join("; ") : fallback;
}
