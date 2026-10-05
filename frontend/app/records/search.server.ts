/**
 * Server-side domain search seam. Browser must not call this path directly.
 */
import { api_fetch_with_token } from "../auth/api.server";
import { class_field_meta } from "../generated/field_meta";
import { parse_enriched_record } from "./enriched_record";
import {
  search_response_schema,
  type SearchCollectionBody,
  type SearchResponse,
  type SearchSortSpec,
} from "./search_envelope";

export {
  search_response_schema,
  type SearchCollectionBody,
  type SearchResponse,
  type SearchSortSpec,
};

/** Typed search API failure with FastAPI ``detail`` when available. */
export class SearchApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "SearchApiError";
    this.status = status;
    this.detail = detail;
  }
}

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

/**
 * POST /api/v2/{class_name}/search via the web-tier Bearer seam.
 * Includes ``sort`` only when the caller supplies a non-empty list so the UI
 * does not invent an API default sort.
 * 400/422 raise {@link SearchApiError} with API ``detail`` when present.
 *
 * Callers must include every FK attribute the UI will render in ``attributes``
 * so the versioned projection joins and returns identity objects for those fields.
 */
export async function search_collection(
  access_token: string,
  class_name: string,
  body: SearchCollectionBody,
): Promise<SearchResponse> {
  const payload: Record<string, unknown> = {
    predicate: body.predicate ?? null,
    attributes: body.attributes,
    limit: body.limit ?? DEFAULT_LIMIT,
    offset: body.offset ?? DEFAULT_OFFSET,
  };
  if (body.sort != null && body.sort.length > 0) {
    payload.sort = body.sort;
  }

  const response = await api_fetch_with_token(
    access_token,
    `/api/v2/${class_name}/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await read_error_detail(response);
    if (response.status === 400 || response.status === 422) {
      throw new SearchApiError(response.status, detail);
    }
    throw new Response(detail, {
      status:
        response.status >= 400 && response.status < 600 ? response.status : 502,
    });
  }

  const response_payload: unknown = await response.json();
  const parsed = search_response_schema.parse(response_payload);
  if (class_field_meta(class_name) == null) {
    throw new Error(`Unknown class for v2 search: ${class_name}`);
  }
  return {
    ...parsed,
    items: parsed.items.map((item) => parse_enriched_record(item, class_name)),
  };
}

async function read_error_detail(response: Response): Promise<string> {
  const fallback = `Search failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body != null && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string" && detail.length > 0) {
        return detail;
      }
      if (Array.isArray(detail)) {
        // FastAPI validation-error list — join messages when present.
        const parts = detail
          .map((item) => {
            if (item != null && typeof item === "object" && "msg" in item) {
              const msg = (item as { msg: unknown }).msg;
              return typeof msg === "string" ? msg : null;
            }
            return null;
          })
          .filter((msg): msg is string => msg != null);
        if (parts.length > 0) {
          return parts.join("; ");
        }
      }
    }
  } catch {
    // fall through
  }
  return fallback;
}
