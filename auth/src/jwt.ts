import { decodeJwt, SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TOKEN_TYP = "access";
export const PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required";
export const SESSION_ID_CLAIM = "sid";
export const ACCESS_TOKEN_IAT_SKEW_SECONDS = 60;

const JOSE_VERIFY = {
  algorithms: ["ES256"],
  requiredClaims: ["sub", "iat", "exp"],
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SignAccessTokenArgs = {
  ttl_seconds?: number;
  exp?: number;
  sid?: string;
  password_change_required?: boolean;
  now?: Date;
};

export type AccessJwtVerifyResult =
  | { kind: "valid"; payload: JWTPayload }
  | { kind: "expired"; payload: JWTPayload }
  | { kind: "invalid" };

export async function sign_access_token(
  private_key: CryptoKey,
  user_id: string,
  args: SignAccessTokenArgs = {},
): Promise<string> {
  const issued = Math.floor((args.now ?? new Date()).getTime() / 1000);
  let exp = args.exp;
  if (exp == null) {
    const ttl = args.ttl_seconds;
    if (ttl == null || !Number.isInteger(ttl) || ttl < 1) {
      throw new Error("sign_access_token requires ttl_seconds or exp");
    }
    exp = issued + ttl;
  }
  const claims: Record<string, unknown> = { typ: ACCESS_TOKEN_TYP };
  if (args.sid != null && args.sid !== "") {
    claims[SESSION_ID_CLAIM] = args.sid;
  }
  if (args.password_change_required === true) {
    claims[PASSWORD_CHANGE_REQUIRED_CLAIM] = true;
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(user_id)
    .setIssuedAt(issued)
    .setExpirationTime(exp)
    .sign(private_key);
}

function custom_claims_ok(payload: JWTPayload, now_seconds: number): boolean {
  if (payload.typ !== ACCESS_TOKEN_TYP) {
    return false;
  }
  if (typeof payload.sub !== "string" || !UUID_RE.test(payload.sub)) {
    return false;
  }
  const sid = payload[SESSION_ID_CLAIM];
  if (typeof sid !== "string" || sid === "") {
    return false;
  }
  const iat = payload.iat;
  const exp = payload.exp;
  if (typeof iat !== "number" || typeof exp !== "number") {
    return false;
  }
  if (!(exp > iat)) {
    return false;
  }
  if (iat > now_seconds + ACCESS_TOKEN_IAT_SKEW_SECONDS) {
    return false;
  }
  return true;
}

function peek_iat(token: string): number | null {
  try {
    const peeked = decodeJwt(token);
    return typeof peeked.iat === "number" ? peeked.iat : null;
  } catch {
    return null;
  }
}

/**
 * Single access-JWT verify used by resource routes, refresh, and logout.
 * `expired` means jose accepted the token when `currentDate` was `iat`
 * (exp may be in the past vs wall clock) and custom claims passed.
 */
export async function verify_access_jwt(
  public_key: CryptoKey,
  token: string,
  now: Date = new Date(),
): Promise<AccessJwtVerifyResult> {
  const now_seconds = Math.floor(now.getTime() / 1000);
  try {
    const { payload } = await jwtVerify(token, public_key, {
      ...JOSE_VERIFY,
      currentDate: now,
    });
    if (!custom_claims_ok(payload, now_seconds)) {
      return { kind: "invalid" };
    }
    return { kind: "valid", payload };
  } catch {
    // Relax exp via jose currentDate = iat; do not hand-roll claim checks.
  }
  const iat = peek_iat(token);
  if (iat == null) {
    return { kind: "invalid" };
  }
  try {
    const { payload } = await jwtVerify(token, public_key, {
      ...JOSE_VERIFY,
      currentDate: new Date(iat * 1000),
    });
    if (!custom_claims_ok(payload, now_seconds)) {
      return { kind: "invalid" };
    }
    return { kind: "expired", payload };
  } catch {
    return { kind: "invalid" };
  }
}

/** Unexpired access JWT only. */
export async function verify_access_token(
  public_key: CryptoKey,
  token: string,
  now: Date = new Date(),
): Promise<JWTPayload> {
  const result = await verify_access_jwt(public_key, token, now);
  if (result.kind !== "valid") {
    throw new Error("invalid access token");
  }
  return result.payload;
}

/** Access JWT whose `exp` may be past; still requires every other check. */
export async function verify_access_token_for_refresh(
  public_key: CryptoKey,
  token: string,
  now: Date = new Date(),
): Promise<JWTPayload> {
  const result = await verify_access_jwt(public_key, token, now);
  if (result.kind === "invalid") {
    throw new Error("invalid access token");
  }
  return result.payload;
}

export function password_change_required(payload: JWTPayload): boolean {
  return payload[PASSWORD_CHANGE_REQUIRED_CLAIM] === true;
}

export function session_id_claim(payload: JWTPayload): string | undefined {
  const sid = payload[SESSION_ID_CLAIM];
  return typeof sid === "string" && sid !== "" ? sid : undefined;
}

export function access_max_age_seconds(token_payload: JWTPayload): number {
  const exp = token_payload.exp;
  if (typeof exp !== "number") {
    return 1;
  }
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
}
