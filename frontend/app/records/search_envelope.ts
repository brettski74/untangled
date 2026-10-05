/**
 * Wire envelope for POST /api/v2/{class_name}/search. Browser- and SSR-safe.
 */
import { z } from "zod";

export const search_response_schema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int(),
});

export type SearchResponse = z.infer<typeof search_response_schema>;

/** Wire sort entry for POST /api/v2/{class_name}/search (user-selected only). */
export type SearchSortSpec = {
  attribute: string;
  direction: "asc" | "desc";
};

export type SearchCollectionBody = {
  predicate?: unknown | null;
  attributes: string[];
  /** Omitted from the wire body when empty/undefined — never invent a default. */
  sort?: SearchSortSpec[];
  limit?: number;
  offset?: number;
};
