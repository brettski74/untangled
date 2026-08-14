export type AuthConfig = {
  public_origin: string;
  cookie_secure: boolean;
};

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

export function load_config_from_env(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const public_origin = env.UNTANGLED_PUBLIC_ORIGIN?.trim() ?? "";
  if (public_origin === "") {
    throw new Error(
      "UNTANGLED_PUBLIC_ORIGIN is required (exact origin, e.g. https://127.0.0.1:8443)",
    );
  }
  try {
    const parsed = new URL(public_origin);
    if (parsed.origin !== public_origin) {
      throw new Error("not an exact origin");
    }
  } catch {
    throw new Error(
      `UNTANGLED_PUBLIC_ORIGIN must be an exact origin (scheme + host + port); got ${JSON.stringify(public_origin)}`,
    );
  }
  return {
    public_origin,
    cookie_secure: cookie_secure_from_env(env.UNTANGLED_COOKIE_SECURE),
  };
}
