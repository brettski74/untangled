/**
 * Stable path mapping for nav options and object sections.
 * M1 option identity is kebab-case display-name (renames are breaking URLs).
 */
import { record_detail_path } from "../records/record_paths";
import type {
  NavBarView,
  NavClassSectionView,
  NavObjectSectionView,
  NavOptionView,
  NavSectionView,
} from "./nav_schema";

const CLASS_COLLECTION: Record<string, string> = {
  change_request: "change-requests",
  incident: "incidents",
  system_config: "system-configs",
};

const COLLECTION_CLASS: Record<string, string> = {
  "change-requests": "change_request",
  incidents: "incident",
  "system-configs": "system_config",
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
  section: NavClassSectionView,
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

export function object_section_path(
  section: NavObjectSectionView,
): string | null {
  const collection = collection_for_class(section.class_name);
  if (collection == null) {
    return null;
  }
  return record_detail_path(collection, section.id);
}

export type NavMatch = {
  section: NavClassSectionView;
  option: NavOptionView;
  path: string;
};

export function find_match_for_path(
  nav: NavBarView,
  pathname: string,
): NavMatch | null {
  for (const section of nav) {
    if (section.section_type !== "class") {
      continue;
    }
    for (const option of section.options) {
      const path = option_path(section, option);
      if (path != null && path === pathname) {
        return { section, option, path };
      }
    }
  }
  return null;
}

/**
 * Route-driven open nav class for the accordion (class sections only).
 *
 * Rule order (do not reorder casually):
 * 1. Exact list/new option path → that option's section class.
 * 2. Else exactly two non-empty segments `/{collection}/{locator}` whose
 *    collection maps to a **class** section present in `nav` → that class.
 *    Object sections use link active state, not accordion open state.
 *    Today only `/new` and `/:locator` share that shape under a collection;
 *    `/new` is covered by (1). Three-segment list paths (`/lists/...`) are
 *    never treated as detail. A future two-segment collection route that is
 *    neither an option path nor detail must update this helper deliberately.
 * 3. Otherwise null (no route-forced open section).
 */
export function open_class_for_path(
  nav: NavBarView,
  pathname: string,
): string | null {
  const option_match = find_match_for_path(nav, pathname);
  if (option_match != null) {
    return option_match.section.class_name;
  }

  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    return null;
  }
  const [collection, _locator] = segments;
  if (collection == null) {
    return null;
  }
  const class_name = class_for_collection(collection);
  if (class_name == null) {
    return null;
  }
  return nav.some(
    (section) =>
      section.section_type === "class" && section.class_name === class_name,
  )
    ? class_name
    : null;
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
  const section = nav.find(
    (item): item is NavClassSectionView =>
      item.section_type === "class" && item.class_name === class_name,
  );
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
  const section = nav.find(
    (item): item is NavClassSectionView =>
      item.section_type === "class" && item.class_name === class_name,
  );
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

export function find_object_section_for_path(
  nav: NavBarView,
  pathname: string,
): NavObjectSectionView | null {
  for (const section of nav) {
    if (section.section_type !== "object") {
      continue;
    }
    const path = object_section_path(section);
    if (path != null && path === pathname) {
      return section;
    }
  }
  return null;
}

/** Type guard helper for callers that still iterate mixed sections. */
export function is_class_section(
  section: NavSectionView,
): section is NavClassSectionView {
  return section.section_type === "class";
}
