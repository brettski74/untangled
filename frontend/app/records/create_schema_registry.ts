/**
 * Class-keyed lookup for generated Create schemas.
 * Observable miss → caller skips client Zod (server remains authoritative).
 */
import type { z } from "zod";

import {
  DemoItemCreateSchema,
  DemoLinkCreateSchema,
  IncidentCreateSchema,
  PermissionCreateSchema,
  RefreshTokenCreateSchema,
  RolePermissionCreateSchema,
  RoleCreateSchema,
  UserRoleCreateSchema,
  UserCreateSchema,
} from "../generated";
import { ChangeRequestCreateWithScheduleSchema } from "./change_request_schedule";
import { zod_object_shape_keys } from "./zod_schema_keys";

export type CreateZodSchema = z.ZodType<Record<string, unknown>>;

const CREATE_SCHEMAS: Readonly<Record<string, CreateZodSchema>> = {
  "change-request":
    ChangeRequestCreateWithScheduleSchema as unknown as CreateZodSchema,
  "demo-item": DemoItemCreateSchema,
  "demo-link": DemoLinkCreateSchema,
  incident: IncidentCreateSchema,
  permission: PermissionCreateSchema,
  "refresh-token": RefreshTokenCreateSchema,
  "role-permission": RolePermissionCreateSchema,
  role: RoleCreateSchema,
  "user-role": UserRoleCreateSchema,
  user: UserCreateSchema,
};

/**
 * Returns the generated Create schema for a class kebab name, or null on miss.
 */
export function create_schema_for_class(
  class_name: string,
): CreateZodSchema | null {
  return CREATE_SCHEMAS[class_name] ?? null;
}

/** Known keys on a Zod object schema (for unrecognized-attribute checks). */
export function create_schema_keys(schema: CreateZodSchema): ReadonlySet<string> {
  return zod_object_shape_keys(schema);
}
