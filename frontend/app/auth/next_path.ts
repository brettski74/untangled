/**
 * Same-origin relative path guard for post-login redirects.
 * Rejects protocol-relative and absolute URLs to avoid open redirects.
 * Rewrites reserved `.data` suffixes and named non-page targets to a
 * document path. Must stay aligned with `auth/src/next_path.ts`.
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

  const query_at = raw.indexOf("?");
  const pathname = query_at === -1 ? raw : raw.slice(0, query_at);
  const query = query_at === -1 ? "" : raw.slice(query_at);

  const data_suffix = ".data";
  const stripped_data = pathname.endsWith(data_suffix);
  const path = stripped_data
    ? pathname.slice(0, -data_suffix.length)
    : pathname;

  if (path === "/_") {
    return fallback;
  }

  if (
    path === "/login" ||
    path === "/logout" ||
    path === "/api" ||
    path.startsWith("/api/")
  ) {
    return fallback;
  }

  const candidate = stripped_data ? path : `${path}${query}`;
  if (candidate !== raw) {
    return safe_next_path(candidate, fallback);
  }
  return candidate;
}
