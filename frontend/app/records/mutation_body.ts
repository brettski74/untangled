/**
 * Client-side create/update body checks (schema-driven; class_name is a param).
 */
import { merge_create_body } from "../detail/create_defaults";
import { class_field_meta } from "../generated/field_meta";
import {
  create_schema_for_class,
  create_schema_keys,
} from "./create_schema_registry";
import {
  update_schema_for_class,
  update_schema_keys,
} from "./update_schema_registry";
import { zod_error_detail, zod_error_http_status } from "./zod_http_status";

export type PreparedBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; detail: string };

export function prepare_create_body(
  class_name: string,
  client_body: Record<string, unknown>,
  env?: Record<string, string>,
): PreparedBody {
  const field_meta = class_field_meta(class_name);
  if (field_meta == null) {
    return { ok: false, status: 404, detail: "Not Found" };
  }
  const merged = merge_create_body(field_meta, client_body, env);
  const schema = create_schema_for_class(class_name);
  if (schema == null) {
    return { ok: true, body: merged };
  }
  const known = create_schema_keys(schema);
  const unknown_keys = Object.keys(merged).filter((k) => !known.has(k));
  if (unknown_keys.length > 0) {
    return {
      ok: false,
      status: 400,
      detail: `Unrecognized attributes: ${unknown_keys.join(", ")}`,
    };
  }
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    const status = zod_error_http_status(parsed.error);
    const { detail } = zod_error_detail(parsed.error);
    return { ok: false, status, detail };
  }
  return { ok: true, body: merged };
}

export function prepare_update_body(
  class_name: string,
  patch_body: Record<string, unknown>,
): PreparedBody {
  if (class_field_meta(class_name) == null) {
    return { ok: false, status: 404, detail: "Not Found" };
  }
  const schema = update_schema_for_class(class_name);
  if (schema == null) {
    return { ok: true, body: patch_body };
  }
  const known = update_schema_keys(schema);
  const unknown_keys = Object.keys(patch_body).filter((k) => !known.has(k));
  if (unknown_keys.length > 0) {
    return {
      ok: false,
      status: 400,
      detail: `Unrecognized attributes: ${unknown_keys.join(", ")}`,
    };
  }
  const parsed = schema.safeParse(patch_body);
  if (!parsed.success) {
    const status = zod_error_http_status(parsed.error);
    const { detail } = zod_error_detail(parsed.error);
    return { ok: false, status, detail };
  }
  return { ok: true, body: patch_body };
}
