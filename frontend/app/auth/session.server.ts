/**
 * httpOnly session cookie holding only the access JWT.
 * See architecture/decisions/002-httponly-cookie-ssr-token-delivery.md.
 */
import {
  createCookieSessionStorage,
  type Session,
  type SessionStorage,
} from "react-router";

import {
  access_token_remaining_seconds,
  cookie_secure_from_env,
} from "./config.server";

const ACCESS_TOKEN_KEY = "access_token";

let session_storage: SessionStorage | null = null;

function require_session_secret(): string {
  const secret = process.env.UNTANGLED_SESSION_SECRET;
  if (secret == null || secret === "") {
    throw new Error(
      "UNTANGLED_SESSION_SECRET is required; refusing to run without an explicit signing secret",
    );
  }
  return secret;
}

/** Lazily build storage so typecheck/build imports do not require UNTANGLED_SESSION_SECRET. */
export function get_session_storage(): SessionStorage {
  if (session_storage != null) {
    return session_storage;
  }
  const secret = require_session_secret();
  session_storage = createCookieSessionStorage({
    cookie: {
      name: "__untangled_session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: cookie_secure_from_env(),
      secrets: [secret],
      // maxAge is set per commit from the access JWT exp claim.
    },
  });
  return session_storage;
}

/** Test helper: drop the cached storage so env changes take effect. */
export function reset_session_storage_for_tests(): void {
  session_storage = null;
}

export async function get_session(request: Request): Promise<Session> {
  const storage = get_session_storage();
  return storage.getSession(request.headers.get("Cookie"));
}

export async function get_access_token(
  request: Request,
): Promise<string | null> {
  const session = await get_session(request);
  const token = session.get(ACCESS_TOKEN_KEY);
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function commit_access_token(
  request: Request,
  access_token: string,
): Promise<string> {
  const storage = get_session_storage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set(ACCESS_TOKEN_KEY, access_token);
  return storage.commitSession(session, {
    maxAge: access_token_remaining_seconds(access_token),
  });
}

export async function destroy_session(request: Request): Promise<string> {
  const storage = get_session_storage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.unset(ACCESS_TOKEN_KEY);
  return storage.destroySession(session);
}
