import type { ReactNode } from "react";

/**
 * Route ``handle`` contract for shell context-bar content via ``useMatches``.
 */
export type ShellContextBarHandle = {
  render_context_bar?: (loader_data: unknown) => ReactNode;
};
