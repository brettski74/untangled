/**
 * Server-side domain search seam. Browser must not call this path directly.
 */
import { z } from "zod";

import { api_fetch_with_token } from "../auth/api.server";

export const search_response_schema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int(),
});

export type SearchResponse = z.infer<typeof search_response_schema>;

export type SearchCollectionBody = {
  predicate?: unknown | null;
  attributes: string[];
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

/**
 * POST /{collection}/search via the web-tier Bearer seam.
 * Omits ``sort`` so the UI does not invent an API default sort.
 */
export async function search_collection(
  access_token: string,
  collection: string,
  body: SearchCollectionBody,
): Promise<SearchResponse> {
  const response = await api_fetch_with_token(
    access_token,
    `/${collection}/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predicate: body.predicate ?? null,
        attributes: body.attributes,
        limit: body.limit ?? DEFAULT_LIMIT,
        offset: body.offset ?? DEFAULT_OFFSET,
      }),
    },
  );

  if (!response.ok) {
    throw new Response(`Search failed with status ${response.status}`, {
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
    });
  }

  const payload: unknown = await response.json();
  return search_response_schema.parse(payload);
}
