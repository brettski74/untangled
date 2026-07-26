/**
 * Server-side auth API seam: login, /auth/me, Bearer fetch.
 * Refresh is deferred to #14 — this module is the single place to extend later.
 */
import { ApiForbiddenError, ApiUnauthorizedError } from "./errors";
import {
  token_pair_schema,
  user_profile_schema,
  type UserProfile,
} from "./schemas";

export function api_base_url(): string {
  const base = process.env.UNTANGLED_API_BASE_URL;
  if (base == null || base === "") {
    throw new Error(
      "UNTANGLED_API_BASE_URL is required (e.g. http://api:8000 in Compose, http://127.0.0.1:8000 for host frontend-dev)",
    );
  }
  return base.replace(/\/$/, "");
}

/**
 * Login via OAuth2 password form. Returns only the access token;
 * refresh_token is discarded immediately and never logged.
 */
export async function login_with_password(
  username: string,
  password: string,
): Promise<{ access_token: string }> {
  const response = await fetch(`${api_base_url()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ username, password }),
  });

  if (response.status === 401) {
    throw new ApiUnauthorizedError("Invalid username or password");
  }
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const body: unknown = await response.json();
  const pair = token_pair_schema.parse(body);
  // Explicitly drop refresh_token — do not return or retain it.
  const { access_token } = pair;
  return { access_token };
}

export async function fetch_me(access_token: string): Promise<UserProfile> {
  const response = await api_fetch_with_token(access_token, "/auth/me", {
    method: "GET",
  });
  const body: unknown = await response.json();
  return user_profile_schema.parse(body);
}

/**
 * Authenticated API call. 401 → ApiUnauthorizedError (caller clears session).
 * 403 → ApiForbiddenError (caller preserves session).
 */
export async function api_fetch_with_token(
  access_token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `${api_base_url()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access_token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    throw new ApiUnauthorizedError();
  }
  if (response.status === 403) {
    throw new ApiForbiddenError();
  }

  return response;
}

/**
 * Classify a status for session handling without performing a fetch.
 * Used by tests and route helpers.
 */
export function session_action_for_status(
  status: number,
): "clear_session" | "preserve_session" | "ok" {
  if (status === 401) {
    return "clear_session";
  }
  if (status === 403) {
    return "preserve_session";
  }
  return "ok";
}
