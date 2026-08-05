/**
 * Presentation-only nav filtering from effective permission keys.
 * API RBAC remains authoritative when #13/#14 wire create/list/search.
 */
import { class_field_meta } from "../generated/field_meta";
import type { NavBarView, NavSectionView } from "./nav_schema";

function has_admin(permissions: readonly string[]): boolean {
  return permissions.includes("admin");
}

function has_class_permission(
  permissions: readonly string[],
  class_name: string,
): boolean {
  if (has_admin(permissions)) {
    return true;
  }
  const prefix = `${class_name}:`;
  return permissions.some((key) => key.startsWith(prefix));
}

export type ClassReadMeta = { public?: boolean };

export function can_read_class(
  permissions: readonly string[],
  class_name: string,
  meta: ClassReadMeta | undefined = class_field_meta(class_name),
): boolean {
  if (meta?.public) {
    return true;
  }
  return (
    has_admin(permissions) || permissions.includes(`${class_name}:read`)
  );
}

function has_class_access(
  permissions: readonly string[],
  class_name: string,
): boolean {
  return (
    has_class_permission(permissions, class_name) ||
    can_read_class(permissions, class_name)
  );
}

export function can_create_class(
  permissions: readonly string[],
  class_name: string,
): boolean {
  return (
    has_admin(permissions) || permissions.includes(`${class_name}:create`)
  );
}

export function can_update_class(
  permissions: readonly string[],
  class_name: string,
): boolean {
  return (
    has_admin(permissions) || permissions.includes(`${class_name}:update`)
  );
}

export function filter_nav_by_permissions(
  nav: NavBarView,
  permissions: readonly string[],
): NavBarView {
  const sections: NavSectionView[] = [];

  for (const section of nav) {
    if (!has_class_access(permissions, section.class_name)) {
      continue;
    }

    const options = section.options.filter((option) => {
      if (option.option_type === "list") {
        return can_read_class(permissions, section.class_name);
      }
      return can_create_class(permissions, section.class_name);
    });

    if (options.length === 0) {
      continue;
    }

    sections.push({ ...section, options });
  }

  return sections;
}
