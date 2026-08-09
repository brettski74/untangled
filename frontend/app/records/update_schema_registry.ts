/**
 * Class-keyed lookup for generated Update schemas.
 * Observable miss → caller skips client Zod (server remains authoritative).
 */
import type { z } from "zod";

import {
  ChangeRequestUpdateSchema,
  DemoItemUpdateSchema,
  DemoLinkUpdateSchema,
  IncidentUpdateSchema,
  PermissionUpdateSchema,
  RefreshTokenUpdateSchema,
  RolePermissionUpdateSchema,
  RoleUpdateSchema,
  SystemConfigUpdateSchema,
  UserRoleUpdateSchema,
  UserUpdateSchema,
} from "../generated";

export type UpdateZodSchema = z.ZodType<Record<string, unknown>>;

const UPDATE_SCHEMAS: Readonly<Record<string, UpdateZodSchema>> = {
  change_request: ChangeRequestUpdateSchema,
  demo_item: DemoItemUpdateSchema,
  demo_link: DemoLinkUpdateSchema,
  incident: IncidentUpdateSchema,
  permission: PermissionUpdateSchema,
  refresh_token: RefreshTokenUpdateSchema,
  role_permission: RolePermissionUpdateSchema,
  role: RoleUpdateSchema,
  system_config: SystemConfigUpdateSchema,
  user_role: UserRoleUpdateSchema,
  user: UserUpdateSchema,
};

/**
 * Returns the generated Update schema for a class name, or null on miss.
 */
export function update_schema_for_class(
  class_name: string,
): UpdateZodSchema | null {
  return UPDATE_SCHEMAS[class_name] ?? null;
}

/** Known keys on a Zod object schema (for unrecognized-attribute checks). */
export function update_schema_keys(schema: UpdateZodSchema): ReadonlySet<string> {
  if (!("shape" in schema) || schema.shape == null) {
    return new Set();
  }
  return new Set(Object.keys(schema.shape as Record<string, unknown>));
}
