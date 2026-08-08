# YAML identifiers and structural keys use snake_case

> **Amended by** `architecture/decisions/014-epic-150-cutover-rules.md` and
> `architecture/decisions/015-epic-150-identity-refinements.md`. Where this
> file and a later amending ADR conflict, the later ADR governs.

## Context

Issue #150 collapses the dual naming convention that used kebab-case for
human-authored YAML (class definitions, nav config, and related identifier
fields) and snake_case for SQL, Python, JSON/API, and JavaScript. Mechanical
kebab↔snake translation at load time was workable for pure configuration, but
breaks down wherever YAML must embed or closely mirror SQL/API identifiers
(for example check-constraint expressions). The product owner has decided that
identifiers use `snake_case` everywhere, including YAML, rather than retaining
a parallel kebab identity.

Recorded constraints still stated YAML = kebab-case. That rule cannot remain
while delivering the decided outcome.

## Decision

1. **Functional identifiers are `snake_case` in every product language
   surface**, including human-authored YAML: class `name`, attribute map keys
   (including system-config attributes), FK references, well-known
   substitution tokens, permission class segments derived from class identity,
   closed functional vocabularies such as attribute `type` tokens and search
   `op` tokens, and equivalent name-typed fields that could reasonably appear
   as identifiers in code or code-like expressions.
2. **Structural keys** in product YAML (class definitions and nav config) use
   `snake_case` (e.g. `display_name`, `check_constraint`, `nav_bar`). Nav
   **data values** are not under a general snake validation rule; class-reference
   fields follow class `name` identity (see ADR 015).
3. Class-definition **filenames** follow the class `name` in snake_case.
4. Loaders and validators **fail closed** on kebab structural keys and
   non-snake values for **in-scope functional-identifier fields** after
   cutover. **No** temporary dual-accept window for those fields. Role `name`
   values are **data**: optional seed snake cleanup is allowed; do **not**
   require or validate role names as snake (ADR 015).
5. Mechanical kebab↔snake translation is **not** retained as a permanent
   identity layer for class/attribute names once YAML is snake. Permission key
   class segments cut over in the **same** change as class `name` (ADR 015).
6. This decision does **not** rename text whose primary purpose is readability
   or aesthetics (human-readable display label *values*, nav list URL slugs
   derived from display labels), domain record field *values* that are
   user/domain data rather than schema/operator identity (unless later
   reclassified as closed system vocabularies meant for code), role `name`
   values (data), or non-product workflow paths (Git branches, ADR filenames,
   skill paths).
7. Public HTTP path and version compatibility for collection segments that
   encode class identity remains governed by ADR 009 **except** for the
   explicit, one-time epic #150 exception recorded in ADR 014. Path segment
   shape (no pluralization) and versioned-factory factoring from v2 onward are
   in ADR 015.

## Alternatives Considered

- **Keep YAML kebab and translate at the boundary forever.** Rejected: the
  translation tax reappears whenever YAML embeds SQL/API identifiers; the
  product owner chose a single convention.
- **Snake only for identifier values; keep kebab structural keys.** Rejected:
  still forces authors and tooling to maintain two spellings inside one
  document and preserves loader dual-convention complexity.
- **Silent dual-accept of kebab and snake indefinitely.** Rejected: prolongs
  the dichotomy and invites divergent documents; fail-closed cutover is
  required.
- **Leave `type` / `op` tokens as kebab string data.** Rejected by later human
  ruling (see ADR 014): those tokens are functional identifiers that may
  appear in code.
- **Validate role names / all nav values as snake.** Rejected by later human
  ruling (see ADR 015).

## Consequences

- `constraints.md` / `boundaries.md` naming claims that say YAML = kebab-case
  are superseded by this ADR (as amended by ADR 014 and ADR 015) until a later
  `review-arch` promotes the update.
- Committed class definitions, nav structural keys, seeds/tests for in-scope
  identity, codegen, and docs must move with the relevant cutovers; permission
  class segments move with class `name`.
- Derived surfaces that embed class identity (permission key class segment,
  registries, `${…}` token catalogs, `type`/`op` vocabularies) follow snake
  spelling of that identity.
- Ordinary collection-path major bumps still follow ADR 009; epic #150’s
  shortened retention/removal shape is only as recorded in ADR 014;
  v2+ path and factory shape as in ADR 015.
- Threat-model notes that treat kebab↔snake normalisation as a residual risk
  for configuration namespace checks (e.g. future `i_*` tier prefixes) become
  narrower once product YAML identity is uniformly snake; residual Unicode /
  case-folding concerns remain.
- Primary agents must include this ADR file (and amending ADRs when applicable)
  in commits with the work that introduced them; the human should be informed
  (may warrant later `review-arch`).
