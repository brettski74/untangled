/**
 * Class-keyed lookup for generated Create schemas.
 * Observable miss → caller skips client Zod (server remains authoritative).
 */
import type { z } from "zod";

import {
  ChangeRequestCreateSchema,
  DemoItemCreateSchema,
  DemoLinkCreateSchema,
  IncidentCreateSchema,
  PermissionCreateSchema,
  RolePermissionCreateSchema,
  RoleCreateSchema,
  UsedRefreshTokenCreateSchema,
  UserRoleCreateSchema,
  UserSessionCreateSchema,
  UserCreateSchema,
} from "../generated";

export type CreateZodSchema = z.ZodType<Record<string, unknown>>;

const CREATE_SCHEMAS: Readonly<Record<string, CreateZodSchema>> = {
  change_request: ChangeRequestCreateSchema,
  demo_item: DemoItemCreateSchema,
  demo_link: DemoLinkCreateSchema,
  incident: IncidentCreateSchema,
  permission: PermissionCreateSchema,
  role_permission: RolePermissionCreateSchema,
  role: RoleCreateSchema,
  used_refresh_token: UsedRefreshTokenCreateSchema,
  user_role: UserRoleCreateSchema,
  user_session: UserSessionCreateSchema,
  user: UserCreateSchema,
};

/**
 * Returns the generated Create schema for a class name, or null on miss.
 */
export function create_schema_for_class(
  class_name: string,
): CreateZodSchema | null {
  return CREATE_SCHEMAS[class_name] ?? null;
}

/** Known keys on a Zod object schema (for unrecognized-attribute checks). */
export function create_schema_keys(schema: CreateZodSchema): ReadonlySet<string> {
  if (!("shape" in schema) || schema.shape == null) {
    return new Set();
  }
  return new Set(Object.keys(schema.shape as Record<string, unknown>));
}
