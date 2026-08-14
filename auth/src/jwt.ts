import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TOKEN_TYP = "access";

export async function sign_access_token(
  private_key: CryptoKey,
  user_id: string,
  ttl_seconds: number,
  now: Date = new Date(),
): Promise<string> {
  const issued = Math.floor(now.getTime() / 1000);
  return new SignJWT({ typ: ACCESS_TOKEN_TYP })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(user_id)
    .setIssuedAt(issued)
    .setExpirationTime(issued + ttl_seconds)
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

export function access_max_age_seconds(token_payload: JWTPayload): number {
  const exp = token_payload.exp;
  if (typeof exp !== "number") {
    return 1;
  }
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
}
