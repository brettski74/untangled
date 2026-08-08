/**
 * Server-side domain PATCH-by-locator seam. Browser must not call this path.
 */
import { z } from "zod";

import { api_fetch_with_token } from "../auth/api.server";
import { class_for_collection } from "../shell/nav_paths";
import { parse_v1_record, type RecordResponse } from "./fetch.server";

export type UpdateRecordBody = Record<string, unknown>;

/**
 * PATCH /api/v1/{collection}/{locator} via the web-tier Bearer seam.
 * Propagates domain 4xx/5xx as Response (except 401/403 from api_fetch_with_token).
 */
export async function update_record(
  access_token: string,
  collection: string,
  locator: string,
  body: UpdateRecordBody,
): Promise<RecordResponse> {
  const encoded = encodeURIComponent(locator);
  const response = await api_fetch_with_token(
    access_token,
    `/api/v1/${collection}/${encoded}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    let detail: unknown = undefined;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new Response(
      typeof detail === "string"
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : `Update failed with status ${response.status}`,
      {
        status:
          response.status >= 400 && response.status < 600
            ? response.status
            : 502,
        statusText: response.statusText || undefined,
      },
    );
  }

  const payload: unknown = await response.json();
  const class_kebab = class_for_collection(collection);
  if (class_kebab == null) {
    throw new Error(`Unknown collection for v1 update: ${collection}`);
  }
  return parse_v1_record(payload, class_kebab);
}

/** Narrow runtime check for JSON object bodies (not arrays). */
export function is_json_object(value: unknown): value is Record<string, unknown> {
  return z.record(z.string(), z.unknown()).safeParse(value).success;
}
