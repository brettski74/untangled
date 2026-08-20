import { csrf_token_from_document_cookie } from "./csrf_browser";
import { safe_next_path } from "./next_path";

export const DEFAULT_SESSION_MAX_REFRESH_RETRIES = 5;
const CSRF_PATH = "/api/v2/auth/csrf";
const LOGIN_PATH = "/api/v2/auth/login";
const REFRESH_PATH = "/api/v2/auth/refresh";

export type AuthenticatedFetchOptions = RequestInit & {
  max_refresh_retries?: number;
};

export function session_max_refresh_retries_from_config(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  ) {
    return value;
  }
  return DEFAULT_SESSION_MAX_REFRESH_RETRIES;
}

export function body_allows_refresh(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body != null &&
    "retry" in body &&
    (body as { retry: unknown }).retry === true
  );
}

function request_href(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function is_refresh_bootstrap(href: string): boolean {
  try {
    const path = new URL(href, "http://localhost").pathname;
    return path === CSRF_PATH || path === LOGIN_PATH || path === REFRESH_PATH;
  } catch {
    return false;
  }
}

function assign_login(): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = `${window.location.pathname}${window.location.search}`;
  const dest = safe_next_path(next, "/");
  window.location.assign(
    dest === "/" ? "/login" : `/login?next=${encodeURIComponent(dest)}`,
  );
}

async function response_allows_refresh(response: Response): Promise<boolean> {
  if (response.status !== 401) {
    return false;
  }
  try {
    const body: unknown = await response.clone().json();
    return body_allows_refresh(body);
  } catch {
    return false;
  }
}

async function csrf_token(): Promise<string> {
  const from_cookie = csrf_token_from_document_cookie();
  if (from_cookie !== "") {
    return from_cookie;
  }
  const response = await fetch(CSRF_PATH, { credentials: "include" });
  if (!response.ok) {
    return "";
  }
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body != null &&
      "csrf_token" in body &&
      typeof body.csrf_token === "string"
    ) {
      return body.csrf_token;
    }
  } catch {
    return "";
  }
  return "";
}

async function post_refresh(): Promise<Response> {
  const token = await csrf_token();
  const headers = new Headers({
    Accept: "application/json",
  });
  if (token !== "") {
    headers.set("X-CSRF-Token", token);
  }
  return fetch(REFRESH_PATH, {
    method: "POST",
    credentials: "include",
    headers,
  });
}

/**
 * Same-origin fetch that CSRF-POSTs ``/api/v2/auth/refresh`` on retryable
 * resource 401s, then retries the original request. 403 never refreshes.
 * Hard 401 (no ``retry``) sends the operator to login.
 */
export async function authenticated_fetch(
  input: RequestInfo | URL,
  init: AuthenticatedFetchOptions = {},
): Promise<Response> {
  const { max_refresh_retries, ...request_init } = init;
  const cap =
    max_refresh_retries ?? DEFAULT_SESSION_MAX_REFRESH_RETRIES;
  const bound = Math.min(10, Math.max(1, cap));
  const href = request_href(input);
  const skip_refresh = is_refresh_bootstrap(href);

  const original = await fetch(input, {
    ...request_init,
    credentials: request_init.credentials ?? "include",
  });
  if (skip_refresh || original.status === 403) {
    return original;
  }
  if (original.status !== 401) {
    return original;
  }
  if (!(await response_allows_refresh(original))) {
    assign_login();
    return original;
  }

  for (let attempt = 0; attempt < bound; attempt += 1) {
    const refreshed = await post_refresh();
    if (refreshed.status === 200) {
      return fetch(input, {
        ...request_init,
        credentials: request_init.credentials ?? "include",
      });
    }
    if (refreshed.status === 401 && (await response_allows_refresh(refreshed))) {
      continue;
    }
    assign_login();
    return refreshed;
  }
  assign_login();
  return original;
}
