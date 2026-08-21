/**
 * Shared FK-enriched record parsing for /api/v2 read/create/update responses.
 * Safe for browser and SSR (no API base URL, no Bearer construction).
 */
import { z } from "zod";

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
