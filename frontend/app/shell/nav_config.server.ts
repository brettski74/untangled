/**
 * Load and validate the product-default nav-bar YAML (SSR / Node only).
 * Content is inlined via Vite `?raw` so the production SSR bundle does not
 * depend on a filesystem path next to `build/server/index.js`.
 *
 * ``${…}`` tokens in object section ``id`` values are resolved in the
 * ``nav-bar`` substitution context at load time (fail closed).
 */
import { parse as parse_yaml } from "yaml";

import nav_bar_yaml from "../config/nav-bar.yaml?raw";
import {
  nav_bar_document_schema,
  to_nav_bar_view,
  type NavBar,
  type NavBarView,
} from "./nav_schema";
import {
  SubstitutionError,
  has_substitution_token,
  substitute,
} from "./well_known_substitute";

let cached: NavBarView | null = null;

function resolve_nav_bar_substitutions(sections: NavBar): NavBar {
  return sections.map((section) => {
    if (section["section-type"] !== "object") {
      if (has_substitution_token(section["display-name"])) {
        throw new SubstitutionError(
          `unsubstituted token in class section display-name ${JSON.stringify(section["display-name"])}`,
        );
      }
      return section;
    }
    const id = substitute(section.id, "nav-bar");
    const display_name = section["display-name"];
    if (has_substitution_token(display_name)) {
      throw new SubstitutionError(
        `unsubstituted token in object section display-name ${JSON.stringify(display_name)}`,
      );
    }
    if (has_substitution_token(id)) {
      throw new SubstitutionError(
        `unsubstituted token remaining in object id ${JSON.stringify(id)}`,
      );
    }
    return { ...section, id };
  });
}

export function load_default_nav(): NavBarView {
  if (cached != null) {
    return cached;
  }
  const parsed = parse_yaml(nav_bar_yaml);
  const document = nav_bar_document_schema.parse(parsed);
  const resolved = resolve_nav_bar_substitutions(document["nav-bar"]);
  cached = to_nav_bar_view(resolved);
  return cached;
}

/** Test helper: clear memoized nav between cases. */
export function reset_default_nav_cache_for_tests(): void {
  cached = null;
}
