import { compactVerify, SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TOKEN_TYP = "access";
export const PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required";
export const SESSION_ID_CLAIM = "sid";

export type SignAccessTokenArgs = {
  ttl_seconds?: number;
  exp?: number;
  sid?: string;
  password_change_required?: boolean;
  now?: Date;
};

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

export async function verify_access_token(
  public_key: CryptoKey,
  token: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, public_key, {
    algorithms: ["ES256"],
    requiredClaims: ["sub", "iat", "exp"],
  });
  if (payload.typ !== ACCESS_TOKEN_TYP) {
    throw new Error("not an access token");
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    throw new Error("missing subject");
  }
  return payload;
}

export function password_change_required(payload: JWTPayload): boolean {
  return payload[PASSWORD_CHANGE_REQUIRED_CLAIM] === true;
}

export const ACCESS_TOKEN_IAT_SKEW_SECONDS = 60;

export async function verify_access_token_for_refresh(
  public_key: CryptoKey,
  token: string,
  now: Date = new Date(),
): Promise<JWTPayload> {
  const { payload: raw } = await compactVerify(token, public_key, {
    algorithms: ["ES256"],
  });
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new Error("malformed access token payload");
  }
  if (claims == null || typeof claims !== "object") {
    throw new Error("malformed access token payload");
  }
  const payload = claims as JWTPayload;
  if (payload.typ !== ACCESS_TOKEN_TYP) {
    throw new Error("not an access token");
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    throw new Error("missing subject");
  }
  const sid = payload[SESSION_ID_CLAIM];
  if (typeof sid !== "string" || sid === "") {
    throw new Error("missing session id");
  }
  const iat = payload.iat;
  const exp = payload.exp;
  if (typeof iat !== "number" || typeof exp !== "number") {
    throw new Error("missing lifetime claims");
  }
  if (!(exp > iat)) {
    throw new Error("inverted lifetime");
  }
  const now_seconds = Math.floor(now.getTime() / 1000);
  if (iat > now_seconds + ACCESS_TOKEN_IAT_SKEW_SECONDS) {
    throw new Error("iat in the future");
  }
  return payload;
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
