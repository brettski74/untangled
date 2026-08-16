import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TOKEN_TYP = "access";
export const PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required";

export type SignAccessTokenArgs = {
  ttl_seconds?: number;
  exp?: number;
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

export function access_max_age_seconds(token_payload: JWTPayload): number {
  const exp = token_payload.exp;
  if (typeof exp !== "number") {
    return 1;
  }
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
}
