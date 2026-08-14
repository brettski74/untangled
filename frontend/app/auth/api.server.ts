/**
 * Server-side auth API seam: /auth/me, Bearer fetch, change-password.
 * Browser login posts to the auth service; this module never sees passwords.
 * Refresh is deferred to #14 — this module is the single place to extend later.
 */
import { ApiForbiddenError, ApiUnauthorizedError } from "./errors";
import {
  change_password_response_schema,
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

export type ChangePasswordBody = {
  current_password: string;
  new_password: string;
  verify_new_password: string;
};

export type ChangePasswordResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

/**
 * POST /auth/change-password via the web-tier Bearer seam.
 * 401 propagates as ApiUnauthorizedError; 200/422 return generic detail.
 */
export async function change_password(
  access_token: string,
  body: ChangePasswordBody,
): Promise<ChangePasswordResult> {
  const response = await api_fetch_with_token(
    access_token,
    "/auth/change-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  let detail = "Password change failed.";
  try {
    const payload: unknown = await response.json();
    detail = change_password_response_schema.parse(payload).detail;
  } catch {
    // Keep generic failure when body is missing or malformed.
  }

  if (response.status === 200) {
    return { ok: true, detail };
  }
  if (response.status === 422) {
    return { ok: false, detail: detail || "Password change failed." };
  }
  return { ok: false, detail: "Password change failed." };
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
