import { cookie_secure_from_env } from "./cookie_secure.js";
import { load_private_key, load_public_key } from "./keys.js";
import { make_authenticate, type AuthenticateFn } from "./users.js";

export type AuthConfig = {
  public_origin: string;
  cookie_secure: boolean;
  private_key: CryptoKey;
  public_key: CryptoKey;
  access_token_ttl_seconds: number;
  authenticate: AuthenticateFn;
};

function require_exact_origin(raw: string, label: string): string {
  const public_origin = raw.trim();
  if (public_origin === "") {
    throw new Error(
      `${label} is required (exact origin, e.g. https://localhost:8443)`,
    );
  }
  try {
    const parsed = new URL(public_origin);
    if (parsed.origin !== public_origin) {
      throw new Error("not an exact origin");
    }
  } catch {
    throw new Error(
      `${label} must be an exact origin (scheme + host + port); got ${JSON.stringify(raw)}`,
    );
  }
  return public_origin;
}

function access_token_ttl_seconds(
  raw: string | undefined = process.env.UNTANGLED_ACCESS_TOKEN_TTL_SECONDS,
): number {
  if (raw == null || raw.trim() === "") {
    return 15 * 60;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `UNTANGLED_ACCESS_TOKEN_TTL_SECONDS must be a positive integer; got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function require_database_url(env: NodeJS.ProcessEnv): string {
  const url = env.DATABASE_URL?.trim() ?? "";
  if (url === "") {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

export async function load_config_from_env(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthConfig> {
  const public_origin = require_exact_origin(
    env.UNTANGLED_PUBLIC_ORIGIN ?? "",
    "UNTANGLED_PUBLIC_ORIGIN",
  );
  const [private_key, public_key] = await Promise.all([
    load_private_key(env),
    load_public_key(env),
  ]);
  return {
    public_origin,
    cookie_secure: cookie_secure_from_env(env.UNTANGLED_COOKIE_SECURE),
    private_key,
    public_key,
    access_token_ttl_seconds: access_token_ttl_seconds(
      env.UNTANGLED_ACCESS_TOKEN_TTL_SECONDS,
    ),
    authenticate: make_authenticate(require_database_url(env)),
  };
}

export { cookie_secure_from_env };
