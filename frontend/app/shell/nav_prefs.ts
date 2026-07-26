/** Nav rail layout prefs — client-local only (no server sync). */

export const NAV_WIDTH_MIN_PX = 100;
export const NAV_WIDTH_MAX_PX = 400;
export const NAV_COLLAPSED_WIDTH_PX = 40;
/** SSR / first-paint default when 20vw is unavailable (~20% of a common desktop). */
export const NAV_DEFAULT_WIDTH_PX = 240;
/** Below this width the nav starts collapsed when no persisted preference exists. */
export const NAV_NARROW_BREAKPOINT_PX = 1024;
export const NAV_PREFS_STORAGE_KEY = "untangled.shell.nav";

export type NavPrefs = {
  collapsed: boolean;
  last_expanded_width: number;
};

export function clamp_nav_width(width: number): number {
  if (!Number.isFinite(width)) {
    return NAV_DEFAULT_WIDTH_PX;
  }
  return Math.min(
    NAV_WIDTH_MAX_PX,
    Math.max(NAV_WIDTH_MIN_PX, Math.round(width)),
  );
}

export function default_nav_prefs(viewport_width: number): NavPrefs {
  return {
    collapsed: viewport_width < NAV_NARROW_BREAKPOINT_PX,
    last_expanded_width: NAV_DEFAULT_WIDTH_PX,
  };
}

export function parse_nav_prefs(raw: string | null): NavPrefs | null {
  if (raw == null || raw === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.collapsed !== "boolean") {
      return null;
    }
    if (typeof record.last_expanded_width !== "number") {
      return null;
    }
    return {
      collapsed: record.collapsed,
      last_expanded_width: clamp_nav_width(record.last_expanded_width),
    };
  } catch {
    return null;
  }
}

export function serialize_nav_prefs(prefs: NavPrefs): string {
  return JSON.stringify({
    collapsed: prefs.collapsed,
    last_expanded_width: clamp_nav_width(prefs.last_expanded_width),
  });
}

export function read_nav_prefs(
  storage: Pick<Storage, "getItem">,
  viewport_width: number,
): NavPrefs {
  const stored = parse_nav_prefs(storage.getItem(NAV_PREFS_STORAGE_KEY));
  if (stored != null) {
    return stored;
  }
  return default_nav_prefs(viewport_width);
}

export function write_nav_prefs(
  storage: Pick<Storage, "setItem">,
  prefs: NavPrefs,
): void {
  storage.setItem(NAV_PREFS_STORAGE_KEY, serialize_nav_prefs(prefs));
}

export function effective_nav_width(prefs: NavPrefs): number {
  return prefs.collapsed
    ? NAV_COLLAPSED_WIDTH_PX
    : clamp_nav_width(prefs.last_expanded_width);
}
