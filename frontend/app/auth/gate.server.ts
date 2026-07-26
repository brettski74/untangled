/**
 * Fail-closed redirects for the SSR auth gate.
 */
import { redirect } from "react-router";

import { safe_next_path } from "./next_path";
import { destroy_session } from "./session.server";

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

/** 401 from API → clear session cookie and send to login. */
export async function redirect_unauthorized(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  const set_cookie = await destroy_session(request);
  return redirect(login_redirect_url(next), {
    headers: { "Set-Cookie": set_cookie },
  });
}
