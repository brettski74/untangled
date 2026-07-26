/**
 * Fail closed when required web auth env is missing.
 * Invoked from the root loader so every SSR request validates config early
 * (Compose healthcheck hits `/`, which runs this loader).
 */
export function assert_web_auth_config(): void {
  if (
    process.env.UNTANGLED_SESSION_SECRET == null ||
    process.env.UNTANGLED_SESSION_SECRET === ""
  ) {
    throw new Error(
      "UNTANGLED_SESSION_SECRET is required; web auth cannot run without an explicit signing secret",
    );
  }
  if (
    process.env.UNTANGLED_API_BASE_URL == null ||
    process.env.UNTANGLED_API_BASE_URL === ""
  ) {
    throw new Error(
      "UNTANGLED_API_BASE_URL is required (e.g. http://api:8000 in Compose, http://127.0.0.1:8000 for host frontend-dev)",
    );
  }
}

/**
 * Cookie Secure flag: secure-on by default; local plain-HTTP must opt out
 * explicitly with UNTANGLED_COOKIE_SECURE=false (or 0). Unrecognized values throw.
 */
export function cookie_secure_from_env(
  raw: string | undefined = process.env.UNTANGLED_COOKIE_SECURE,
): boolean {
  if (raw == null || raw === "") {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }
  throw new Error(
    `UNTANGLED_COOKIE_SECURE must be true/false (or 1/0); got ${JSON.stringify(raw)}`,
  );
}

/**
 * Remaining lifetime from the access JWT `exp` claim (no signature verify —
 * the API already issued this token; we only align cookie maxAge).
 */
export function access_token_remaining_seconds(access_token: string): number {
  const parts = access_token.split(".");
  if (parts.length < 2 || parts[1] == null || parts[1] === "") {
    throw new Error("Access token is not a JWT");
  }
  const payload_json = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload = JSON.parse(payload_json) as { exp?: unknown };
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    throw new Error("Access token missing numeric exp claim");
  }
  return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
}
