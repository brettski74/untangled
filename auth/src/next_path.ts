/**
 * Same-origin relative path guard for post-login redirects.
 * Matches the SSR `safe_next_path` rules.
 */
export function safe_next_path(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (raw == null || raw === "") {
    return fallback;
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return fallback;
  }
  return raw;
}
