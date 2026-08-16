/**
 * Server-side auth API seam: GET /api/v2/auth/me on the auth service, Bearer
 * fetch to the Python domain API. Browser login and change-password post to
 * the auth service; this module never sees passwords.
 * Refresh is deferred to #14 — this module is the single place to extend later.
 */
import { ApiForbiddenError, ApiUnauthorizedError } from "./errors";
import { user_profile_schema, type UserProfile } from "./schemas";

export function api_base_url(): string {
  const base = process.env.UNTANGLED_API_BASE_URL;
  if (base == null || base === "") {
    throw new Error(
      "UNTANGLED_API_BASE_URL is required (e.g. http://api:8000 in Compose, http://localhost:8000 for host frontend-dev)",
    );
  }
  return base.replace(/\/$/, "");
}

export function auth_base_url(): string {
  const base = process.env.UNTANGLED_AUTH_BASE_URL;
  if (base == null || base === "") {
    throw new Error(
      "UNTANGLED_AUTH_BASE_URL is required (e.g. http://auth:3000 in Compose, http://localhost:3001 for host frontend-dev)",
    );
  }
  return base.replace(/\/$/, "");
}

export async function fetch_me(access_token: string): Promise<UserProfile> {
  const response = await fetch(`${auth_base_url()}/api/v2/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/json",
    },
  });
  if (response.status === 401) {
    throw new ApiUnauthorizedError();
  }
  if (response.status === 403) {
    throw new ApiForbiddenError();
  }
  if (!response.ok) {
    throw new Error(`auth /me failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  return user_profile_schema.parse(body);
}

/**
 * Authenticated domain API call. 401 → ApiUnauthorizedError (caller clears session).
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
