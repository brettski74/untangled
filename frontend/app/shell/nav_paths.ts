/**
 * Stable path mapping for nav options.
 * M1 option identity is kebab-case display-name (renames are breaking URLs).
 */
import type { NavBarView, NavOptionView, NavSectionView } from "./nav_schema";

const CLASS_COLLECTION: Record<string, string> = {
  "change-request": "change-requests",
  incident: "incidents",
};

const COLLECTION_CLASS: Record<string, string> = {
  "change-requests": "change-request",
  incidents: "incident",
};

export function display_name_to_slug(display_name: string): string {
  return display_name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function collection_for_class(class_name: string): string | null {
  return CLASS_COLLECTION[class_name] ?? null;
}

export function class_for_collection(collection: string): string | null {
  return COLLECTION_CLASS[collection] ?? null;
}

export function option_path(
  section: NavSectionView,
  option: NavOptionView,
): string | null {
  const collection = collection_for_class(section.class_name);
  if (collection == null) {
    return null;
  }
  if (option.option_type === "new") {
    return `/${collection}/new`;
  }
  const slug = display_name_to_slug(option.display_name);
  if (slug === "") {
    return null;
  }
  return `/${collection}/lists/${slug}`;
}

export type NavMatch = {
  section: NavSectionView;
  option: NavOptionView;
  path: string;
};

export function find_match_for_path(
  nav: NavBarView,
  pathname: string,
): NavMatch | null {
  for (const section of nav) {
    for (const option of section.options) {
      const path = option_path(section, option);
      if (path != null && path === pathname) {
        return { section, option, path };
      }
    }
  }
  return null;
}

export function find_list_option(
  nav: NavBarView,
  collection: string,
  list_id: string,
): NavMatch | null {
  const class_name = class_for_collection(collection);
  if (class_name == null) {
    return null;
  }
  const section = nav.find((item) => item.class_name === class_name);
  if (section == null) {
    return null;
  }
  for (const option of section.options) {
    if (option.option_type !== "list") {
      continue;
    }
    if (display_name_to_slug(option.display_name) === list_id) {
      const path = option_path(section, option);
      if (path == null) {
        return null;
      }
      return { section, option, path };
    }
  }
  return null;
}

export function find_new_option(
  nav: NavBarView,
  collection: string,
): NavMatch | null {
  const class_name = class_for_collection(collection);
  if (class_name == null) {
    return null;
  }
  const section = nav.find((item) => item.class_name === class_name);
  if (section == null) {
    return null;
  }
  const option = section.options.find((item) => item.option_type === "new");
  if (option == null) {
    return null;
  }
  const path = option_path(section, option);
  if (path == null) {
    return null;
  }
  return { section, option, path };
}
