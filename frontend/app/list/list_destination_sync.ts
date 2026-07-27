/**
 * Destination-identity sync for list page UI (#76 verify).
 * Search + quick-filter chrome reset together when the nav list changes.
 */
import type { AttributeFieldMeta } from "../generated/field_meta";
import type { ListSearchPayload } from "./list_context_bar";
import {
  quick_filter_destination_reset,
  type QuickFilterDestinationReset,
  type SearchPredicate,
} from "./quick_filter";

export type ListDestinationLoaderSlice = {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  effective_predicate: SearchPredicate | null;
  attributes: readonly AttributeFieldMeta[];
};

export type ListDestinationUiSync = {
  search: ListSearchPayload;
  quick_filter: QuickFilterDestinationReset;
};

/**
 * Build search + quick-filter defaults for a list destination.
 * Used by DestinationListPage on mount and whenever loaderData.path changes.
 */
export function list_destination_ui_sync(
  loader: ListDestinationLoaderSlice,
): ListDestinationUiSync {
  return {
    search: {
      rows: loader.rows,
      total: loader.total,
      limit: loader.limit,
      offset: loader.offset,
      effective_predicate: loader.effective_predicate,
    },
    quick_filter: quick_filter_destination_reset(loader.attributes),
  };
}
