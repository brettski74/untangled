/**
 * Presentation-only nav filtering from effective permission keys.
 * API RBAC remains authoritative when #13/#14 wire create/list/search.
 */
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

function can_read_class(
  permissions: readonly string[],
  class_name: string,
): boolean {
  return (
    has_admin(permissions) || permissions.includes(`${class_name}:read`)
  );
}

function can_create_class(
  permissions: readonly string[],
  class_name: string,
): boolean {
  return (
    has_admin(permissions) || permissions.includes(`${class_name}:create`)
  );
}

export function filter_nav_by_permissions(
  nav: NavBarView,
  permissions: readonly string[],
): NavBarView {
  const sections: NavSectionView[] = [];

  for (const section of nav) {
    if (!has_class_permission(permissions, section.class_name)) {
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
