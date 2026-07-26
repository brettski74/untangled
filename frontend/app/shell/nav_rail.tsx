import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";

import {
  NAV_DEFAULT_WIDTH_PX,
  type NavPrefs,
  clamp_nav_width,
  effective_nav_width,
  read_nav_prefs,
  write_nav_prefs,
} from "./nav_prefs";
import { find_match_for_path, option_path } from "./nav_paths";
import type { NavBarView } from "./nav_schema";

export type ShellNavRailProps = {
  nav: NavBarView;
};

export function ShellNavRail({ nav }: ShellNavRailProps) {
  const location = useLocation();
  const active = find_match_for_path(nav, location.pathname);
  const route_open_class = active?.section.class_name ?? null;

  const [prefs, set_prefs] = useState<NavPrefs>({
    collapsed: false,
    last_expanded_width: NAV_DEFAULT_WIDTH_PX,
  });
  const [hydrated, set_hydrated] = useState(false);
  const [user_open_class, set_user_open_class] = useState<string | null>(null);
  const drag_start_x = useRef<number | null>(null);
  const drag_start_width = useRef(NAV_DEFAULT_WIDTH_PX);
  const collapse_button_ref = useRef<HTMLButtonElement>(null);

  const open_class = user_open_class ?? route_open_class;

  useEffect(() => {
    set_user_open_class(null);
  }, [location.pathname]);

  useEffect(() => {
    const next = read_nav_prefs(window.localStorage, window.innerWidth);
    set_prefs(next);
    set_hydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    write_nav_prefs(window.localStorage, prefs);
  }, [prefs, hydrated]);

  useEffect(() => {
    function on_pointer_move(event: PointerEvent) {
      if (drag_start_x.current == null || prefs.collapsed) {
        return;
      }
      const delta = event.clientX - drag_start_x.current;
      const next_width = clamp_nav_width(drag_start_width.current + delta);
      set_prefs((current) => ({
        ...current,
        last_expanded_width: next_width,
      }));
    }

    function on_pointer_up() {
      drag_start_x.current = null;
    }

    window.addEventListener("pointermove", on_pointer_move);
    window.addEventListener("pointerup", on_pointer_up);
    return () => {
      window.removeEventListener("pointermove", on_pointer_move);
      window.removeEventListener("pointerup", on_pointer_up);
    };
  }, [prefs.collapsed]);

  const width_px = effective_nav_width(prefs);

  function toggle_collapsed() {
    set_prefs((current) => {
      const next_collapsed = !current.collapsed;
      // Focus stays on the toggle so it is not lost into a hidden nav body.
      queueMicrotask(() => collapse_button_ref.current?.focus());
      return { ...current, collapsed: next_collapsed };
    });
  }

  return (
    <nav
      aria-label="Primary"
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] text-[var(--color-shell-chrome-fg)]"
      style={{ width: width_px }}
    >
      <div className="flex h-10 shrink-0 items-center justify-end px-1">
        <button
          ref={collapse_button_ref}
          type="button"
          aria-expanded={!prefs.collapsed}
          aria-controls="shell-nav-body"
          aria-label={prefs.collapsed ? "Expand navigation" : "Collapse navigation"}
          title={prefs.collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={toggle_collapsed}
          className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
        >
          {prefs.collapsed ? (
            <ArrowRightToLine className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowLeftToLine className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <div
        id="shell-nav-body"
        hidden={prefs.collapsed}
        className="min-h-0 flex-1 overflow-auto px-2 pb-3 text-sm"
      >
        {nav.length === 0 ? (
          <p className="px-2 text-xs text-[var(--color-shell-chrome-muted)]">
            No navigation options for this account.
          </p>
        ) : (
          <ul className="space-y-1">
            {nav.map((section) => {
              const section_id = `nav-section-${section.class_name}`;
              const expanded = open_class === section.class_name;
              return (
                <li key={section.class_name}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={section_id}
                    onClick={() => set_user_open_class(section.class_name)}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left font-medium text-[var(--color-shell-chrome-fg)] hover:bg-white/10"
                  >
                    {section.display_name}
                  </button>
                  <ul
                    id={section_id}
                    hidden={!expanded}
                    className="mt-0.5 space-y-0.5 border-l border-[var(--color-shell-separator)] ml-2 pl-2"
                  >
                    {section.options.map((option) => {
                      const path = option_path(section, option);
                      if (path == null) {
                        return null;
                      }
                      return (
                        <li key={`${section.class_name}:${option.display_name}`}>
                          <NavLink
                            to={path}
                            className={({ isActive }) =>
                              [
                                "block rounded px-2 py-1 text-[var(--color-shell-chrome-muted)] hover:bg-white/10 hover:text-[var(--color-shell-chrome-fg)]",
                                isActive
                                  ? "bg-white/15 text-[var(--color-shell-chrome-fg)]"
                                  : "",
                              ].join(" ")
                            }
                          >
                            {option.display_name}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!prefs.collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          tabIndex={0}
          className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-white/20"
          onPointerDown={(event) => {
            event.preventDefault();
            drag_start_x.current = event.clientX;
            drag_start_width.current = prefs.last_expanded_width;
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              set_prefs((current) => ({
                ...current,
                last_expanded_width: clamp_nav_width(
                  current.last_expanded_width - 10,
                ),
              }));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              set_prefs((current) => ({
                ...current,
                last_expanded_width: clamp_nav_width(
                  current.last_expanded_width + 10,
                ),
              }));
            }
          }}
        />
      ) : null}
    </nav>
  );
}
