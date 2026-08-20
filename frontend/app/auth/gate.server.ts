/**
 * Fail-closed redirects for the SSR auth gate.
 */
import { redirect } from "react-router";

import { safe_next_path } from "./next_path";
import {
  classify_access_cookie,
  destroy_session,
} from "./session.server";

export const DOCUMENT_BOOTSTRAP = "bootstrap";

export function login_redirect_url(next: string | null | undefined): string {
  const destination = safe_next_path(next, "/");
  if (destination === "/") {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(destination)}`;
}

/** No session → send to login, preserving a safe next path. */
export function redirect_unauthenticated(
  request: Request,
): Response {
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  return redirect(login_redirect_url(next));
}

/**
 * Document GET with an expired-but-valid access JWT (not must-change)
 * returns a bootstrap sentinel. Nested loaders must not fetch when they
 * see this. Non-GET and every other cookie state stay fail-closed.
 */
export async function require_document_access(
  request: Request,
): Promise<string | typeof DOCUMENT_BOOTSTRAP> {
  const classified = await classify_access_cookie(request);
  if (classified.kind === "valid") {
    if (classified.password_change_required) {
      throw redirect("/expired-password");
    }
    return classified.token;
  }
  if (
    classified.kind === "expired" &&
    !classified.password_change_required &&
    request.method === "GET"
  ) {
    return DOCUMENT_BOOTSTRAP;
  }
  throw redirect_unauthenticated(request);
}

/** 401 from API → clear session cookie and send to login. */
export async function redirect_unauthorized(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  const set_cookie = await destroy_session(request);
  return redirect(login_redirect_url(next), {
    headers: { "Set-Cookie": set_cookie },
  });
}

/**
 * Authenticated but denied — preserve session; surface as a route error.
 * Sets statusText explicitly (Response body alone is not statusText).
 */
export function forbidden_response(): Response {
  return new Response("Forbidden", {
    status: 403,
    statusText: "Forbidden",
  });
}
