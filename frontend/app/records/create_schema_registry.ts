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
  RefreshTokenCreateSchema,
  RolePermissionCreateSchema,
  RoleCreateSchema,
  UserRoleCreateSchema,
  UserCreateSchema,
} from "../generated";

export type CreateZodSchema = z.ZodType<Record<string, unknown>>;

const CREATE_SCHEMAS: Readonly<Record<string, CreateZodSchema>> = {
  "change-request": ChangeRequestCreateSchema,
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
  if (!("shape" in schema) || schema.shape == null) {
    return new Set();
  }
  return new Set(Object.keys(schema.shape as Record<string, unknown>));
}
