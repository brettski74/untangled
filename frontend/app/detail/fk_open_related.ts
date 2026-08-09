/**
 * FK open-related href resolution (fail-closed when unset or unknown class).
 */
import { class_field_meta } from "../generated/field_meta";
import { record_detail_path } from "../records/record_paths";
import { fk_display_label, fk_link_locator } from "../records/fk_identity";

export type FkOpenRelated = {
  navigable: boolean;
  href: string | null;
  tooltip: string;
};

/**
 * Build open-related control state for an FK value.
 * Label text is owned by callers via fk_display_label; tooltip uses the
 * display fallback when available.
 */
export function fk_open_related(
  references: string | null,
  value: unknown,
): FkOpenRelated {
  const locator = fk_link_locator(value);
  if (locator == null) {
    return {
      navigable: false,
      href: null,
      tooltip: "Open related record",
    };
  }

  const label = fk_display_label(value) ?? locator;
  const tooltip = `Open ${label}`;

  if (references == null || references === "") {
    return { navigable: false, href: null, tooltip };
  }

  if (class_field_meta(references) == null) {
    return { navigable: false, href: null, tooltip };
  }

  return {
    navigable: true,
    href: record_detail_path(references, locator),
    tooltip,
  };
}
