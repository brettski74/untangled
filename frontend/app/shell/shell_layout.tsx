import { useRef, useState, type ReactNode } from "react";

import { ShellContextBar as RouteHandleContextBar } from "./context_bar";
import type { NavBarView } from "./nav_schema";
import { ShellHeader } from "./header";
import { ShellNavRail } from "./nav_rail";
import { ShellContextBarProvider } from "./shell_context_bar";

export type ShellLayoutProps = {
  display_name: string;
  username: string;
  nav: NavBarView;
  children: ReactNode;
};

/**
 * Authenticated operator chrome: header, nav rail, context bar, content pane.
 * Narrow viewports (&lt;1024px) start with the nav collapsed when no localStorage
 * preference exists — see `NAV_NARROW_BREAKPOINT_PX` in `nav_prefs.ts`.
 *
 * Context bar: list routes portal interactive chrome (#76); other routes use
 * route ``handle.render_context_bar`` (#81) when the portal slot is free.
 */
export function ShellLayout({
  display_name,
  username,
  nav,
  children,
}: ShellLayoutProps) {
  const slot_ref = useRef<HTMLDivElement | null>(null);
  const [occupied, set_occupied] = useState(false);

  return (
    <ShellContextBarProvider
      slot_ref={slot_ref}
      set_occupied={set_occupied}
    >
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--color-shell-content)] text-slate-900">
        <a href="#main-content" className="shell-skip-link">
          Skip to main content
        </a>

        <ShellHeader display_name={display_name} username={username} />

        <div className="flex min-h-0 flex-1">
          <ShellNavRail nav={nav} />

          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={slot_ref}
              className={
                occupied
                  ? "flex h-10 shrink-0 items-center border-b border-[var(--color-shell-separator)] bg-[var(--color-shell-context)] px-2 text-[var(--color-shell-chrome-fg)]"
                  : "hidden"
              }
              aria-hidden={occupied ? undefined : true}
              role={occupied ? "toolbar" : undefined}
              aria-label={occupied ? "List context" : undefined}
            />
            {occupied ? null : <RouteHandleContextBar />}
            <main
              id="main-content"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-auto"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </ShellContextBarProvider>
  );
}
