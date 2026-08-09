/**
 * Server-side domain POST-create seam. Browser must not call this path.
 */
import { api_fetch_with_token } from "../auth/api.server";
import { class_field_meta } from "../generated/field_meta";
import { parse_enriched_record, type RecordResponse } from "./fetch.server";

export type CreateRecordBody = Record<string, unknown>;

/**
 * POST /api/v2/{class_name} via the web-tier Bearer seam.
 * Response uses the same FK identity enrichment as versioned fetch.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function create_record(
  access_token: string,
  class_name: string,
  body: CreateRecordBody,
): Promise<RecordResponse> {
  const response = await api_fetch_with_token(
    access_token,
    `/api/v2/${class_name}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

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
  if (class_field_meta(class_name) == null) {
    throw new Error(`Unknown class for v2 create: ${class_name}`);
  }
  return parse_enriched_record(payload, class_name);
}
