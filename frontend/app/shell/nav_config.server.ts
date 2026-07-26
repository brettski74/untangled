/**
 * Load and validate the product-default nav-bar YAML (SSR / Node only).
 * Content is inlined via Vite `?raw` so the production SSR bundle does not
 * depend on a filesystem path next to `build/server/index.js`.
 */
import { parse as parse_yaml } from "yaml";

import nav_bar_yaml from "../config/nav-bar.yaml?raw";
import {
  nav_bar_document_schema,
  to_nav_bar_view,
  type NavBarView,
} from "./nav_schema";

let cached: NavBarView | null = null;

export function load_default_nav(): NavBarView {
  if (cached != null) {
    return cached;
  }
  const parsed = parse_yaml(nav_bar_yaml);
  const document = nav_bar_document_schema.parse(parsed);
  cached = to_nav_bar_view(document["nav-bar"]);
  return cached;
}

/** Test helper: clear memoized nav between cases. */
export function reset_default_nav_cache_for_tests(): void {
  cached = null;
}
