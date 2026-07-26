import type { ReactNode } from "react";

import { ShellHeader } from "./header";
import { ShellNavRail } from "./nav_rail";

export type ShellLayoutProps = {
  display_name: string;
  username: string;
  children: ReactNode;
};

/**
 * Authenticated operator chrome: header, nav rail, context bar, content pane.
 * Narrow viewports (&lt;1024px) start with the nav collapsed when no localStorage
 * preference exists — see `NAV_NARROW_BREAKPOINT_PX` in `nav_prefs.ts`.
 */
export function ShellLayout({
  display_name,
  username,
  children,
}: ShellLayoutProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--color-shell-content)] text-slate-900">
      <a href="#main-content" className="shell-skip-link">
        Skip to main content
      </a>

      <ShellHeader display_name={display_name} username={username} />

      <div className="flex min-h-0 flex-1">
        <ShellNavRail />

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="h-10 shrink-0 border-b border-[var(--color-shell-separator)] bg-[var(--color-shell-context)]"
            aria-hidden="true"
          />
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
  );
}
