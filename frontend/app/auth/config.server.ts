/**
 * Fail closed when required web auth env is missing.
 * Invoked from the root loader so every SSR request validates config early
 * (Compose healthcheck hits `/`, which runs this loader).
 */
import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";

function normalize_pem(raw: string): string {
  let pem = raw.trim();
  if (pem.includes("\\n") && !pem.includes("\n")) {
    pem = pem.replaceAll("\\n", "\n");
  }
  return pem;
}

/** SPKI P-256 PEM used to verify `__untangled_access` (fail closed). */
export function read_jwt_public_pem(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const text = env.UNTANGLED_JWT_PUBLIC_KEY?.trim() ?? "";
  const path = env.UNTANGLED_JWT_PUBLIC_KEY_PATH?.trim() ?? "";
  if (text !== "" && path !== "") {
    throw new Error(
      "UNTANGLED_JWT_PUBLIC_KEY and UNTANGLED_JWT_PUBLIC_KEY_PATH cannot both be set",
    );
  }
  if (text !== "") {
    return normalize_pem(text);
  }
  if (path !== "") {
    try {
      return normalize_pem(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(
        `UNTANGLED_JWT_PUBLIC_KEY_PATH is unreadable (${path}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  throw new Error(
    "UNTANGLED_JWT_PUBLIC_KEY or UNTANGLED_JWT_PUBLIC_KEY_PATH is required; web auth cannot run without an ES256 public key",
  );
}

function assert_p256_public_pem(pem: string): void {
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new Error("UNTANGLED_JWT_PUBLIC_KEY must be an SPKI P-256 public key");
  }
  if (key.asymmetricKeyType !== "ec") {
    throw new Error("UNTANGLED_JWT_PUBLIC_KEY must be an EC public key");
  }
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (curve !== "prime256v1" && curve !== "P-256") {
    throw new Error("UNTANGLED_JWT_PUBLIC_KEY must be a P-256 (secp256r1) key");
  }
}

export function assert_web_auth_config(): void {
  if (
    process.env.UNTANGLED_API_BASE_URL == null ||
    process.env.UNTANGLED_API_BASE_URL === ""
  ) {
    throw new Error(
      "UNTANGLED_API_BASE_URL is required (e.g. http://api:8000 in Compose, http://localhost:8000 for host frontend-dev)",
    );
  }
  if (
    process.env.UNTANGLED_AUTH_BASE_URL == null ||
    process.env.UNTANGLED_AUTH_BASE_URL === ""
  ) {
    throw new Error(
      "UNTANGLED_AUTH_BASE_URL is required (e.g. http://auth:3000 in Compose, http://localhost:3001 for host frontend-dev)",
    );
  }
  assert_p256_public_pem(read_jwt_public_pem());
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
 * used only to align cookie Max-Age when tests commit a cookie).
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
