/**
 * Server-side domain POST-create seam. Browser must not call this path.
 * Unversioned write surface (same family as update; not the versioned read API).
 */
import { api_fetch_with_token } from "../auth/api.server";
import { record_response_schema, type RecordResponse } from "./fetch.server";

export type CreateRecordBody = Record<string, unknown>;

/**
 * POST /{collection} via the web-tier Bearer seam.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function create_record(
  access_token: string,
  collection: string,
  body: CreateRecordBody,
): Promise<RecordResponse> {
  const response = await api_fetch_with_token(access_token, `/${collection}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail: unknown = undefined;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new Response(
      typeof detail === "string"
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : `Create failed with status ${response.status}`,
      {
        status:
          response.status >= 400 && response.status < 600
            ? response.status
            : 502,
        statusText: response.statusText || undefined,
      },
    );
  }

  const payload: unknown = await response.json();
  return record_response_schema.parse(payload);
}
