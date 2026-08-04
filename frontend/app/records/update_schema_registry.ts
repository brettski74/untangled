/**
 * Class-keyed lookup for generated Update schemas.
 * Observable miss → caller skips client Zod (server remains authoritative).
 */
import type { z } from "zod";

import {
  DemoItemUpdateSchema,
  DemoLinkUpdateSchema,
  IncidentUpdateSchema,
  PermissionUpdateSchema,
  RefreshTokenUpdateSchema,
  RolePermissionUpdateSchema,
  RoleUpdateSchema,
  UserRoleUpdateSchema,
  UserUpdateSchema,
} from "../generated";
import { ChangeRequestUpdateWithScheduleSchema } from "./change_request_schedule";
import { zod_object_shape_keys } from "./zod_schema_keys";

export type UpdateZodSchema = z.ZodType<Record<string, unknown>>;

const UPDATE_SCHEMAS: Readonly<Record<string, UpdateZodSchema>> = {
  "change-request":
    ChangeRequestUpdateWithScheduleSchema as unknown as UpdateZodSchema,
  "demo-item": DemoItemUpdateSchema,
  "demo-link": DemoLinkUpdateSchema,
  incident: IncidentUpdateSchema,
  permission: PermissionUpdateSchema,
  "refresh-token": RefreshTokenUpdateSchema,
  "role-permission": RolePermissionUpdateSchema,
  role: RoleUpdateSchema,
  "user-role": UserRoleUpdateSchema,
  user: UserUpdateSchema,
};

/**
 * Returns the generated Update schema for a class kebab name, or null on miss.
 */
export function update_schema_for_class(
  class_name: string,
): UpdateZodSchema | null {
  return UPDATE_SCHEMAS[class_name] ?? null;
}

/** Known keys on a Zod object schema (for unrecognized-attribute checks). */
export function update_schema_keys(schema: UpdateZodSchema): ReadonlySet<string> {
  return zod_object_shape_keys(schema);
}
