import { useMatches } from "react-router";

import type { ShellContextBarHandle } from "./context_bar_handle";

/**
 * Shell context bar: empty decorative strip, or route-provided toolbar via handle.
 */
export function ShellContextBar() {
  const matches = useMatches();

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match == null) {
      continue;
    }
    const handle = match.handle as ShellContextBarHandle | undefined;
    if (handle?.render_context_bar == null) {
      continue;
    }
    return (
      <div
        role="toolbar"
        aria-label="Context bar"
        className="flex h-10 shrink-0 items-center border-b border-[var(--color-shell-separator)] bg-[var(--color-shell-context)]"
      >
        {handle.render_context_bar(match.loaderData)}
      </div>
    );
  }

  return (
    <div
      className="h-10 shrink-0 border-b border-[var(--color-shell-separator)] bg-[var(--color-shell-context)]"
      aria-hidden="true"
    />
  );
}
