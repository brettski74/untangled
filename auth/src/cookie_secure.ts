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
