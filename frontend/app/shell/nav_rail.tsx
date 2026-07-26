import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  NAV_DEFAULT_WIDTH_PX,
  type NavPrefs,
  clamp_nav_width,
  effective_nav_width,
  read_nav_prefs,
  write_nav_prefs,
} from "./nav_prefs";

export function ShellNavRail() {
  const [prefs, set_prefs] = useState<NavPrefs>({
    collapsed: false,
    last_expanded_width: NAV_DEFAULT_WIDTH_PX,
  });
  const [hydrated, set_hydrated] = useState(false);
  const drag_start_x = useRef<number | null>(null);
  const drag_start_width = useRef(NAV_DEFAULT_WIDTH_PX);

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
  const collapse_button_ref = useRef<HTMLButtonElement>(null);

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
        className="min-h-0 flex-1 overflow-auto px-3 pb-3 text-xs text-[var(--color-shell-chrome-muted)]"
      >
        <p>
          Navigation body stub. YAML sections, accordion options, and RBAC
          filtering land in{" "}
          <a
            className="underline text-[var(--color-shell-chrome-fg)]"
            href="https://github.com/brettski74/untangled/issues/66"
          >
            #66
          </a>
          .
        </p>
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
