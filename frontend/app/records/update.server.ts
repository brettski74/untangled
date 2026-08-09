/**
 * Server-side domain PATCH-by-locator seam. Browser must not call this path.
 */
import { z } from "zod";

import { api_fetch_with_token } from "../auth/api.server";
import { class_field_meta } from "../generated/field_meta";
import { parse_enriched_record, type RecordResponse } from "./fetch.server";

export type UpdateRecordBody = Record<string, unknown>;

/**
 * PATCH /api/v2/{class_name}/{locator} via the web-tier Bearer seam.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function update_record(
  access_token: string,
  class_name: string,
  locator: string,
  body: UpdateRecordBody,
): Promise<RecordResponse> {
  const encoded = encodeURIComponent(locator);
  const response = await api_fetch_with_token(
    access_token,
    `/api/v2/${class_name}/${encoded}`,
    {
      method: "PATCH",
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
          : `Update failed with status ${response.status}`,
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
    throw new Error(`Unknown class for v2 update: ${class_name}`);
  }
  return parse_enriched_record(payload, class_name);
}

/** Narrow runtime check for JSON object bodies (not arrays). */
export function is_json_object(value: unknown): value is Record<string, unknown> {
  return z.record(z.string(), z.unknown()).safeParse(value).success;
}
