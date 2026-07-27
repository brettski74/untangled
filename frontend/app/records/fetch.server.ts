/**
 * Server-side domain GET-by-locator seam. Browser must not call this path.
 */
import { z } from "zod";

import { api_fetch_with_token } from "../auth/api.server";

export const record_response_schema = z.record(z.string(), z.unknown());

export type RecordResponse = z.infer<typeof record_response_schema>;

/**
 * GET /{collection}/{locator} via the web-tier Bearer seam.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function fetch_record(
  access_token: string,
  collection: string,
  locator: string,
): Promise<RecordResponse> {
  const encoded = encodeURIComponent(locator);
  const response = await api_fetch_with_token(
    access_token,
    `/${collection}/${encoded}`,
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
  return record_response_schema.parse(payload);
}
