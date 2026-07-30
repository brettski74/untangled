/**
 * Shared FK identity helpers for /api/v1 enriched read responses.
 */
import { z } from "zod";

export const fk_identity_schema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().nullable().optional(),
    friendly_id: z.string().nullable().optional(),
  })
  .strict();

export type FkIdentity = z.infer<typeof fk_identity_schema>;

export function is_fk_identity(value: unknown): value is FkIdentity {
  return fk_identity_schema.safeParse(value).success;
}

/**
 * Display fallback: trimmed display_name → trimmed friendly_id → canonical id.
 * Returns null when the FK itself is null/absent.
 */
export function fk_display_label(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (!is_fk_identity(value)) {
    return null;
  }
  if (typeof value.display_name === "string") {
    const display = value.display_name.trim();
    if (display !== "") {
      return display;
    }
  }
  if (typeof value.friendly_id === "string") {
    const friendly = value.friendly_id.trim();
    if (friendly !== "") {
      return friendly;
    }
  }
  return value.id;
}

/**
 * Locator for related links: trimmed non-empty friendly_id, else id.
 * Returns null when the FK itself is null/absent.
 */
export function fk_link_locator(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (!is_fk_identity(value)) {
    return null;
  }
  if (typeof value.friendly_id === "string") {
    const friendly = value.friendly_id.trim();
    if (friendly !== "") {
      return friendly;
    }
  }
  return value.id;
}
