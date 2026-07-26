/** Shared JWT-shaped fixture for auth unit tests (unsigned; exp only). */
export function fake_access_token(ttl_seconds = 900): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttl_seconds }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}
