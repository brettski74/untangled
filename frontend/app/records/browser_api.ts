/**
 * Same-origin domain API calls from the browser via authenticated_fetch.
 * Paths are relative /api/v2/{class_name}; class_name is a parameter, never a
 * per-class branch.
 */
import { authenticated_fetch } from "../auth/refresh_fetch";
import { class_field_meta } from "../generated/field_meta";
import { parse_enriched_record, type RecordResponse } from "./enriched_record";
import {
  search_response_schema,
  type SearchCollectionBody,
  type SearchResponse,
} from "./search_envelope";

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export type BrowserApiFailure = {
  ok: false;
  status: number;
  detail: string;
};

export type BrowserApiSuccess<T> = { ok: true } & T;

export type BrowserApiResult<T> = BrowserApiSuccess<T> | BrowserApiFailure;

function search_path(class_name: string): string {
  return `/api/v2/${class_name}/search`;
}

function collection_path(class_name: string): string {
  return `/api/v2/${class_name}`;
}

function record_path(class_name: string, locator: string): string {
  return `/api/v2/${class_name}/${encodeURIComponent(locator)}`;
}

export async function read_error_detail(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body != null && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string" && detail.length > 0) {
        return detail;
      }
      if (
        detail != null &&
        typeof detail === "object" &&
        "detail" in detail &&
        typeof (detail as { detail: unknown }).detail === "string"
      ) {
        return (detail as { detail: string }).detail;
      }
      if (Array.isArray(detail)) {
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

function json_headers(): Headers {
  return new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
}

export async function search_records(
  class_name: string,
  body: SearchCollectionBody,
): Promise<BrowserApiResult<{ search: SearchResponse }>> {
  const payload: Record<string, unknown> = {
    predicate: body.predicate ?? null,
    attributes: body.attributes,
    limit: body.limit ?? DEFAULT_LIMIT,
    offset: body.offset ?? DEFAULT_OFFSET,
  };
  if (body.sort != null && body.sort.length > 0) {
    payload.sort = body.sort;
  }

  const response = await authenticated_fetch(search_path(class_name), {
    method: "POST",
    headers: json_headers(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: await read_error_detail(response),
    };
  }
  const response_payload: unknown = await response.json();
  const parsed = search_response_schema.parse(response_payload);
  if (class_field_meta(class_name) == null) {
    return { ok: false, status: 500, detail: `Unknown class: ${class_name}` };
  }
  return {
    ok: true,
    search: {
      ...parsed,
      items: parsed.items.map((item) => parse_enriched_record(item, class_name)),
    },
  };
}

export async function create_record(
  class_name: string,
  body: Record<string, unknown>,
): Promise<BrowserApiResult<{ record: RecordResponse }>> {
  const response = await authenticated_fetch(collection_path(class_name), {
    method: "POST",
    headers: json_headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: await read_error_detail(response),
    };
  }
  const payload: unknown = await response.json();
  if (class_field_meta(class_name) == null) {
    return { ok: false, status: 500, detail: `Unknown class: ${class_name}` };
  }
  return { ok: true, record: parse_enriched_record(payload, class_name) };
}

export async function update_record(
  class_name: string,
  locator: string,
  body: Record<string, unknown>,
): Promise<BrowserApiResult<{ record: RecordResponse }>> {
  const response = await authenticated_fetch(record_path(class_name, locator), {
    method: "PATCH",
    headers: json_headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: await read_error_detail(response),
    };
  }
  const payload: unknown = await response.json();
  if (class_field_meta(class_name) == null) {
    return { ok: false, status: 500, detail: `Unknown class: ${class_name}` };
  }
  return { ok: true, record: parse_enriched_record(payload, class_name) };
}
