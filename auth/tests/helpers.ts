import { generateKeyPair } from "jose";

import type { AuthConfig } from "../src/config.js";
import { cookie_secure_from_env } from "../src/cookie_secure.js";
import type { AuthenticateFn } from "../src/users.js";

export const PUBLIC_ORIGIN = "https://127.0.0.1:8443";
export const TEST_USER_ID = "01900000-0000-7000-8000-000000000001";

export async function test_config(
  overrides: {
    authenticate?: AuthenticateFn;
    cookie_secure?: boolean;
    public_origin?: string;
  } = {},
): Promise<AuthConfig> {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const authenticate: AuthenticateFn =
    overrides.authenticate ??
    (async (username, password) => {
      if (username === "admin" && password === "admin-change-me") {
        return { id: TEST_USER_ID, username: "admin" };
      }
      return null;
    });
  return {
    public_origin: overrides.public_origin ?? PUBLIC_ORIGIN,
    cookie_secure: overrides.cookie_secure ?? true,
    private_key: privateKey,
    public_key: publicKey,
    access_token_ttl_seconds: 900,
    authenticate,
  };
}

export { cookie_secure_from_env };
