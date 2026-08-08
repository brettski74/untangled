# Public domain HTTP APIs use major path versions

## Context

Issue #73 introduces a backward-incompatible read-response change: foreign-key UUID
scalars become identity objects for versioned fetch and search. Existing consumers and
parallel work still depend on the unversioned scalar contract. Treating versioning as a
ticket-local route detail would leave later endpoints free to choose incompatible
versioning and compatibility rules.

## Decision

Public domain HTTP APIs use major path versions: `/api/v{major}/...`.

1. `/api/v1` is the first versioned contract. Existing unversioned routes are
   pre-versioning legacy contracts; they are not retrospectively v1.
2. Every new public domain endpoint, and every existing public domain endpoint whose
   contract changes, must have a versioned path. Operational endpoints such as `/health`
   and `/` are exempt.
3. A backward-incompatible request or response change increments the major path version.
   The previous version remains available for a documented compatibility/deprecation
   period. Backward-compatible additions may remain in the current major version.
4. Version bindings stay thin and share handlers, persistence, and business logic where
   behavior is common; versions must not become copied application stacks.
5. Migration may be incremental. Unmodified legacy endpoints need not be bulk-copied into
   v1, but documentation must direct new consumers to versioned contracts and identify
   remaining unversioned routes as legacy.
6. The creation of a new versioned route must include the creation of a linked follow-up
   removal issue whenever deprecated API routes/versions are retained for compatibility.
   This is to ensure that the eventual removal of the legacy routes is not forgotten and
   the technical debt that it represents is eventually cleaned up.

## Alternatives Considered

- **Change the unversioned response in place.** Rejected: breaks existing consumers and
  parallel work with no compatibility boundary.
- **Call existing unversioned routes v1.** Rejected: disguises a pre-versioning contract and
  makes its later incompatible migration ambiguous.
- **Version only the two issue #73 routes without platform policy.** Rejected: invites
  inconsistent versioning mechanisms and lifecycle rules on later endpoints.
- **Bulk-copy every existing endpoint into v1 now.** Rejected: duplicates unchanged routes
  and expands the ticket without improving their contracts.
- **Use header or query-parameter versioning.** Rejected: path versions are explicit in
  links, logs, routing, documentation, and generated API descriptions.

## Consequences

- Issue #73 may add v1 fetch/search while preserving scalar-UUID unversioned reads.
- During migration, clients can encounter both versioned and legacy surfaces; compatibility
  tests and clear documentation are required to prevent drift and accidental new adoption
  of legacy routes.
- Breaking changes require parallel major routes for a documented transition, increasing
  router and test surface. Thin bindings and shared internals contain that cost.
- Removal timing is a release/deprecation decision, not fixed by this ADR.
- **Exception note:** epic #150 records a one-time, epic-scoped waiver of long-lived
  previous-major retention for kebab collection path retirement in
  `architecture/decisions/014-epic-150-cutover-rules.md`, including a **dark**
  `/api/v2` introduction whose collection segments always track live class `name`
  (temporarily kebab until that epic’s identity-rename child; no path spelling
  shim; endorsed FE cutover only after rename). That exception does **not**
  generalise and does **not** waive Decision §3 for majors that already have
  endorsed consumers; other work continues under this ADR unless a further human
  ruling and ADR say otherwise.
- **Factory note (from v2):** `architecture/decisions/015-epic-150-identity-refinements.md`
  requires each API major from `/api/v2` onward to use a versioned factory composing
  shared modules (not long-lived `surface=`-style multi-version conditionals in one
  factory), so retiring a major is unmount + delete module. Point 4’s “thin bindings /
  share handlers” intent is met by composition of shared modules, not by one
  multi-major conditional factory.
- Primary agents must include this ADR file in commits with the work that introduced it;
  the human should be informed and may request later promotion into the main architecture
  documents.
