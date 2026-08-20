/**
 * HttpOnly `__untangled_access` cookie: issued by the auth service, verified
 * here with the ES256 public key. The JWT is never exposed to browser JS.
 */
import { importSPKI } from "jose";

import { verify_access_jwt } from "./access_jwt";
import { CSRF_COOKIE_NAME } from "./cookie_names";
import {
  access_token_remaining_seconds,
  cookie_secure_from_env,
  read_jwt_public_pem,
} from "./config.server";

export { CSRF_COOKIE_NAME };
export const ACCESS_COOKIE_NAME = "__untangled_access";
export const REFRESH_COOKIE_NAME = "__untangled_refresh";
export const ACCESS_COOKIE_PATH = "/";
export const REFRESH_COOKIE_PATH = "/api/v2/auth/refresh";

let public_key: CryptoKey | null = null;

async function jwt_public_key(): Promise<CryptoKey> {
  if (public_key != null) {
    return public_key;
  }
  public_key = await importSPKI(read_jwt_public_pem(), "ES256");
  return public_key;
}

/** Test helper: drop the cached key so env changes take effect. */
export function reset_access_verifier_for_tests(): void {
  public_key = null;
}

function parse_cookie_header(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (header == null || header === "") {
    return out;
  }
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut <= 0) {
      continue;
    }
    const name = part.slice(0, cut).trim();
    const value = part.slice(cut + 1).trim();
    if (name !== "") {
      out.set(name, value);
    }
  }
  return out;
}

function serialize_cookie(
  name: string,
  value: string,
  attrs: {
    http_only: boolean;
    secure: boolean;
    same_site: "Lax";
    path: string;
    max_age: number;
  },
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${attrs.path}`,
    `SameSite=${attrs.same_site}`,
    `Max-Age=${attrs.max_age}`,
  ];
  if (attrs.http_only) {
    parts.push("HttpOnly");
  }
  if (attrs.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

async function verified_access_session(
  token: string,
  key: CryptoKey,
): Promise<{ token: string; password_change_required: boolean } | null> {
  const classified = await classify_access_token(token, key);
  if (classified.kind !== "valid") {
    return null;
  }
  return {
    token,
    password_change_required: classified.password_change_required,
  };
}

export type AccessClassification =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "expired"; password_change_required: boolean }
  | { kind: "valid"; token: string; password_change_required: boolean };

async function classify_access_token(
  token: string,
  key: CryptoKey,
): Promise<AccessClassification> {
  const result = await verify_access_jwt(key, token);
  if (result.kind === "invalid") {
    return { kind: "invalid" };
  }
  const password_change_required =
    result.payload.password_change_required === true;
  if (result.kind === "expired") {
    return { kind: "expired", password_change_required };
  }
  return { kind: "valid", token, password_change_required };
}

export type AccessSession = {
  token: string;
  password_change_required: boolean;
};

export async function get_access_session(
  request: Request,
): Promise<AccessSession | null> {
  const token = parse_cookie_header(request.headers.get("Cookie")).get(
    ACCESS_COOKIE_NAME,
  );
  if (token == null || token === "") {
    return null;
  }
  const key = await jwt_public_key();
  return verified_access_session(token, key);
}

export async function classify_access_cookie(
  request: Request,
): Promise<AccessClassification> {
  const token = parse_cookie_header(request.headers.get("Cookie")).get(
    ACCESS_COOKIE_NAME,
  );
  if (token == null || token === "") {
    return { kind: "missing" };
  }
  const key = await jwt_public_key();
  return classify_access_token(token, key);
}

export async function get_access_token(
  request: Request,
): Promise<string | null> {
  const session = await get_access_session(request);
  return session?.token ?? null;
}

/** Test/helper: emit the same access-cookie attributes auth sets on login. */
export async function commit_access_token(
  _request: Request,
  access_token: string,
): Promise<string> {
  return serialize_cookie(ACCESS_COOKIE_NAME, access_token, {
    http_only: true,
    secure: cookie_secure_from_env(),
    same_site: "Lax",
    path: ACCESS_COOKIE_PATH,
    max_age: access_token_remaining_seconds(access_token),
  });
}

/** Raw access JWT from the cookie; does not verify signature or expiry. */
export function read_access_cookie(request: Request): string | null {
  const token = parse_cookie_header(request.headers.get("Cookie")).get(
    ACCESS_COOKIE_NAME,
  );
  if (token == null || token === "") {
    return null;
  }
  return token;
}

export function read_csrf_cookie(request: Request): string {
  return (
    parse_cookie_header(request.headers.get("Cookie")).get(CSRF_COOKIE_NAME) ??
    ""
  );
}

export async function destroy_session(_request: Request): Promise<string> {
  return serialize_cookie(ACCESS_COOKIE_NAME, "", {
    http_only: true,
    secure: cookie_secure_from_env(),
    same_site: "Lax",
    path: ACCESS_COOKIE_PATH,
    max_age: 0,
  });
}

export function expire_refresh_cookie(): string {
  return serialize_cookie(REFRESH_COOKIE_NAME, "", {
    http_only: true,
    secure: cookie_secure_from_env(),
    same_site: "Lax",
    path: REFRESH_COOKIE_PATH,
    max_age: 0,
  });
}

export function expire_logout_cookies(): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", serialize_cookie(ACCESS_COOKIE_NAME, "", {
    http_only: true,
    secure: cookie_secure_from_env(),
    same_site: "Lax",
    path: ACCESS_COOKIE_PATH,
    max_age: 0,
  }));
  headers.append("Set-Cookie", expire_refresh_cookie());
  return headers;
}
