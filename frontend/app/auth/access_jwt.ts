import {
  decodeJwt,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyOptions,
} from "jose";

export const ACCESS_TOKEN_TYP = "access";
export const PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required";
export const SESSION_ID_CLAIM = "sid";
export const ACCESS_TOKEN_IAT_SKEW_SECONDS = 60;

const JOSE_VERIFY: Required<
  Pick<JWTVerifyOptions, "algorithms" | "requiredClaims">
> = {
  algorithms: ["ES256"],
  requiredClaims: ["sub", "iat", "exp"],
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessJwtVerifyResult =
  | { kind: "valid"; payload: JWTPayload }
  | { kind: "expired"; payload: JWTPayload }
  | { kind: "invalid" };

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
 * Same access-JWT flow as auth/src/jwt.ts. Duplicated until #136 collapses
 * auth and SSR onto one JavaScript module.
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
    // Relax exp via jose currentDate = iat.
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
