/**
 * Permission-aware default landing: prefer Change Requests → All,
 * else the first remaining visible **class** option. Object sections are
 * not home routes. null = no destinations.
 */
import { filter_nav_by_permissions } from "./nav_filter";
import { option_path } from "./nav_paths";
import type { NavBarView } from "./nav_schema";

const PREFERRED_CLASS = "change-request";
const PREFERRED_LIST_SLUG = "all";

export function default_landing_path(
  nav: NavBarView,
  permissions: readonly string[],
): string | null {
  const visible = filter_nav_by_permissions(nav, permissions);

  for (const section of visible) {
    if (section.section_type !== "class") {
      continue;
    }
    if (section.class_name !== PREFERRED_CLASS) {
      continue;
    }
    for (const option of section.options) {
      if (option.option_type !== "list") {
        continue;
      }
      const path = option_path(section, option);
      if (path != null && path.endsWith(`/lists/${PREFERRED_LIST_SLUG}`)) {
        return path;
      }
    }
  }

  for (const section of visible) {
    if (section.section_type !== "class") {
      continue;
    }
    for (const option of section.options) {
      const path = option_path(section, option);
      if (path != null) {
        return path;
      }
    }
  }

  return null;
}
