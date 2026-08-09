/** Credential redaction for Redis URLs in logs / errors. */

export function redact_redis_url(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "";
    }
    // URL serializes empty password as "user:@" — strip the dangling colon.
    return parsed.toString().replace(/\/\/([^/@]+):@/, "//$1@").replace(/\/\/:@/, "//");
  } catch {
    return "<invalid-redis-url>";
  }
}
