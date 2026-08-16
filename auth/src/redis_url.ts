/** Credential redaction for Redis URLs in logs / errors. */

export const DEFAULT_REDIS_URL = "redis://localhost:6379/0";

export function redis_url_from_env(
  raw: string | undefined = process.env.UNTANGLED_REDIS_URL,
): string {
  if (raw === undefined) {
    return DEFAULT_REDIS_URL;
  }
  const stripped = raw.trim();
  if (stripped === "") {
    throw new Error(
      "UNTANGLED_REDIS_URL is set but empty; set a redis:// URL or unset the variable to use the host default",
    );
  }
  return stripped;
}

export function redact_redis_url(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "";
    }
    return parsed
      .toString()
      .replace(/\/\/([^/@]+):@/, "//$1@")
      .replace(/\/\/:@/, "//");
  } catch {
    return "<invalid-redis-url>";
  }
}
