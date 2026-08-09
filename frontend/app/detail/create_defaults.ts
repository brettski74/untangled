/**
 * Schema-driven create defaults for the new-record path.
 * No collection/class-name switches — walk ClassFieldMeta only.
 */
import type { ClassFieldMeta } from "../generated/field_meta";
import { attributes_in_declaration_order } from "../list/columns";
import { DETAIL_AUDIT_FIELDS } from "./default_layout";

const SYSTEM_STRIP = new Set<string>([
  "id",
  ...DETAIL_AUDIT_FIELDS.map((f) => f.name_snake),
]);

/**
 * Synthetic display/seed record from attribute create_default metadata.
 * Friendly-id, id, and audit slots stay empty/null until after create.
 */
export function record_from_create_defaults(
  meta: ClassFieldMeta,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const attr of attributes_in_declaration_order(meta.attributes)) {
    if (attr.name_snake === "id" || attr.type_name === "friendly_id") {
      record[attr.name_snake] = null;
      continue;
    }
    if (attr.create_default !== undefined) {
      record[attr.name_snake] = attr.create_default;
    } else {
      record[attr.name_snake] = null;
    }
  }
  for (const audit of DETAIL_AUDIT_FIELDS) {
    record[audit.name_snake] = null;
  }
  return record;
}

/**
 * Authoritative create-body assembly for the SSR action (and client enablement).
 *
 * - Editable author fields: client value when present, else create_default.
 * - FK / referenced attributes (read-only on M1 new): schema create_default only
 *   (client cannot override).
 * - Never includes id, friendly_id, or system audit fields.
 */
export function merge_create_body(
  meta: ClassFieldMeta,
  client_body: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const friendly = meta.friendly_id_attr;

  for (const attr of attributes_in_declaration_order(meta.attributes)) {
    const name = attr.name_snake;
    if (SYSTEM_STRIP.has(name) || attr.type_name === "friendly_id") {
      continue;
    }
    if (friendly != null && name === friendly) {
      continue;
    }

    const is_fk = attr.references != null;
    if (is_fk) {
      if (attr.create_default !== undefined) {
        body[name] = attr.create_default;
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(client_body, name)) {
      body[name] = client_body[name];
    } else if (attr.create_default !== undefined) {
      body[name] = attr.create_default;
    }
  }

  return body;
}

/** Prefer friendly_id locator when present; else UUID id. */
export function preferred_create_locator(
  meta: ClassFieldMeta,
  record: Record<string, unknown>,
): string | null {
  if (meta.friendly_id_attr != null) {
    const value = record[meta.friendly_id_attr];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  if (typeof record.id === "string" && record.id.length > 0) {
    return record.id;
  }
  return null;
}

/**
 * New-record Save enablement (icon still tracks dirty separately).
 * Schema miss → leave enabled when permitted (server final word).
 */
export function new_save_enabled(args: {
  can_create: boolean;
  dirty: boolean;
  create_valid: boolean;
  schema_available: boolean;
}): boolean {
  if (!args.can_create) {
    return false;
  }
  if (!args.schema_available) {
    return true;
  }
  return args.dirty || args.create_valid;
}
