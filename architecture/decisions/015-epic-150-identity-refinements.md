# Epic #150 identity and versioning refinements

## Context

Further human product-owner rulings on epic #150 refined which names are
validated as functional identifiers, how v2+ record paths encode class
identity, how API majors are factored for deletion, and when permission key
class segments must cut over. ADR 014’s earlier note that retiring legacy/v1
is “mount drop + `surface` branch pruning” conflicts with the versioned-factory
ruling and must be corrected.

## Decision

This ADR **amends ADR 013 and ADR 014**. ADR 009 remains the default public
API versioning policy; the epic #150 retention exception in ADR 014 stays in
force. From `/api/v2` onward, major factoring follows the rules below.

1. **Role names are data.** Optional seed spelling cleanup to `snake_case` is
   allowed and harmless. Do **not** add snake_case validation or a requirement
   that role `name` values be snake. Role names are not functional identifiers
   under ADR 013’s enforcement rule.
2. **Nav YAML.** Only **structural keys** migrate to snake with fail-closed
   validation. Do **not** add a general snake validation rule on nav data
   values. Fields that reference a class follow class `name` identity (and thus
   snake when class names do); that is identity inheritance, not a nav-value
   snake rule. Display-derived list URL slugs remain out of scope.
3. **No pluralization on v2+ record paths.** Path segments that encode class
   identity use the class `name` directly (end-state examples after identity
   rename: `/api/v2/incident/...`, `/api/v2/change_request/...`). Drop
   contrived plural collection mapping as part of v2. Until the epic’s
   identity-rename child, live `name` may still be kebab and paths track it
   (dark `/api/v2` window—ADR 014 §6); do **not** add a v2 kebab↔snake path
   shim. In-app class segments that mirrored pluralization follow the same
   when cut over with v2. Display-derived list slugs are unchanged.
4. **Versioned factories from v2 onward.** Do **not** use `surface=` (or
   similar) multi-version conditionals in one factory as the versioning
   mechanism. Each API major gets a **versioned factory** that composes shared
   modules. Optimize for deletion of retired majors (unmount + delete the
   version module). Prefer short-term duplication over multi-version
   conditional complexity. The same expectation applies to versioned code
   generators where they exist. This begins with v2; retiring legacy/v1 should
   be simple deletion of the old factory/module, not pruning branches inside a
   shared multi-surface factory. ADR 014’s prior “`surface` branch pruning”
   retirement shape is withdrawn.
5. **Permission key class segment** must cut over in the **same** change as
   class `name` migration. Do not defer permission spelling to a later child
   that would require a temporary kebab↔snake translation shim for class
   identity.

## Alternatives Considered

- **Validate role names as snake functional identifiers.** Rejected by human
  ruling: role names are data; optional seed cleanup is enough.
- **Snake-validate all nav values.** Rejected: only structural keys need the
  convention enforcement; class refs follow class identity separately.
- **Keep plural collection path mapping on v2.** Rejected: contrived
  pluralization is another translation tax on class identity.
- **Keep one factory with `surface=` (or equivalent) conditionals across
  majors.** Rejected: deletion of a retired major should be unmount + delete
  module; multi-version conditionals entrench complexity.
- **Cut over permission keys after class `name`.** Rejected: forces a
  translation shim and splits one identity change across children.

## Consequences

- ADR 013’s enforced snake set does **not** include role `name` or general nav
  data values; it does include nav structural keys, class identity, and
  permission class segments (cut over with class `name`).
- ADR 014’s removal child retires legacy/v1 by deleting the old
  factory/module(s), not by pruning `surface` branches in a shared multi-major
  factory. The short coexistence + last-child removal exception otherwise
  remains as in ADR 014.
- ADR 009’s “thin bindings / share handlers” intent is satisfied by versioned
  factories composing shared modules; it must not be read as licence for
  long-lived multi-version conditionals inside one factory from v2 onward.
- v2 record URLs are singular class-name segments (live `name`); clients and
  in-app maps that assumed plurals must move with the endorsed v2 cutover
  after identity rename (ADR 014).
- Primary agents must include this ADR (and amended ADR 013/014 text) in
  commits with the work that introduced them; the human should be informed
  (may warrant later `review-arch`).
