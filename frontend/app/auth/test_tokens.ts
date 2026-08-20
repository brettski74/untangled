import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

const ADMIN_SUB = "01900000-0000-7000-8000-000000000001";
const TEST_SID = "01900000-0000-7000-8000-0000000000aa";

let private_key: KeyObject | null = null;

/** Session ES256 pair for unit tests; sets `UNTANGLED_JWT_PUBLIC_KEY`. */
export function install_test_jwt_keys(): void {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  private_key = pair.privateKey;
  process.env.UNTANGLED_JWT_PUBLIC_KEY = pair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  delete process.env.UNTANGLED_JWT_PUBLIC_KEY_PATH;
}

/** Signed ES256 access JWT matching the test public key. */
export function fake_access_token(
  ttl_seconds = 900,
  extra: Record<string, unknown> = {},
): string {
  if (private_key == null) {
    install_test_jwt_keys();
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: ADMIN_SUB,
      sid: TEST_SID,
      iat: now,
      exp: now + ttl_seconds,
      typ: "access",
      ...extra,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const sig = sign("sha256", Buffer.from(data), {
    key: private_key as KeyObject,
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${sig.toString("base64url")}`;
}
