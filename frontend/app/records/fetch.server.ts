/**
 * Server-side domain GET-by-locator seam. Browser must not call this path.
 */
import { api_fetch_with_token } from "../auth/api.server";
import { class_field_meta } from "../generated/field_meta";
import { parse_enriched_record, type RecordResponse } from "./enriched_record";

export type { RecordResponse };

/**
 * GET /api/v2/{class_name}/{locator} via the web-tier Bearer seam.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function fetch_record(
  access_token: string,
  class_name: string,
  locator: string,
): Promise<RecordResponse> {
  const encoded = encodeURIComponent(locator);
  const response = await api_fetch_with_token(
    access_token,
    `/api/v2/${class_name}/${encoded}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Response(`Fetch failed with status ${response.status}`, {
      status:
        response.status >= 400 && response.status < 600 ? response.status : 502,
      statusText: response.statusText || undefined,
    });
  }

  const payload: unknown = await response.json();
  if (class_field_meta(class_name) == null) {
    throw new Error(`Unknown class for v2 fetch: ${class_name}`);
  }
  return parse_enriched_record(payload, class_name);
}
