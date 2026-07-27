/**
 * FK open-related href resolution (fail-closed when unset or unmapped).
 */
import { record_detail_path } from "../records/record_paths";
import { collection_for_class } from "../shell/nav_paths";

export type FkOpenRelated = {
  navigable: boolean;
  href: string | null;
  tooltip: string;
};

/**
 * Build open-related control state for an FK value.
 * Display stays on UUID until #73; tooltip uses the referenced id token.
 */
export function fk_open_related(
  references: string | null,
  value: unknown,
): FkOpenRelated {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      navigable: false,
      href: null,
      tooltip: "Open related record",
    };
  }

  const id = value.trim();
  const tooltip = `Open ${id}`;

  if (references == null || references === "") {
    return { navigable: false, href: null, tooltip };
  }

  const collection = collection_for_class(references);
  if (collection == null) {
    return { navigable: false, href: null, tooltip };
  }

  return {
    navigable: true,
    href: record_detail_path(collection, id),
    tooltip,
  };
}
