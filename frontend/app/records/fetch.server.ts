/**
 * Server-side domain GET-by-locator seam. Browser must not call this path.
 */
import { z } from "zod";

import { api_fetch_with_token } from "../auth/api.server";
import { class_field_meta } from "../generated/field_meta";
import { fk_identity_schema } from "./fk_identity";

const AUDIT_FK_FIELDS = new Set(["created_by", "updated_by"]);

export const record_response_schema = z.record(z.string(), z.unknown());

export type RecordResponse = z.infer<typeof record_response_schema>;

/**
 * Validate an enriched read/create record: FK fields present in the payload
 * must be identity objects or null; other fields remain unconstrained scalars.
 */
export function parse_enriched_record(
  payload: unknown,
  class_name: string,
): RecordResponse {
  const record = record_response_schema.parse(payload);
  const meta = class_field_meta(class_name);
  if (meta == null) {
    throw new Error(`Unknown class for enriched record validation: ${class_name}`);
  }
  const fk_fields = new Set<string>(AUDIT_FK_FIELDS);
  for (const attr of meta.attributes) {
    if (attr.references != null) {
      fk_fields.add(attr.name_snake);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!fk_fields.has(key)) {
      continue;
    }
    if (value == null) {
      continue;
    }
    fk_identity_schema.parse(value);
  }
  return record;
}

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
