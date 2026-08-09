# Epic #150 functional-identifier cutover rules

> **Amended by** `architecture/decisions/015-epic-150-identity-refinements.md`
> (role names as data; nav structural-keys-only validation; no v2+ path
> pluralization; versioned factories from v2; permission class segment with
> class `name`). Where this file and ADR 015 conflict, ADR 015 governs.
>
> **Further amended** under human ruling for issue #186 / epic #150: dark
> `/api/v2` introduction may use live kebab `name` until the identity-rename
> child; see Decision §6.

## Context

Human product-owner rulings on epic #150 strengthened the snake_case naming
principle and overturned carve-outs recorded in ADR 013 (temporary dual-accept;
leaving attribute `type` / search `op` tokens as kebab “string data”; treating
public collection-path spelling solely under ADR 009’s ordinary retention
rules). The epic also needs a recorded, bounded exception to ADR 009’s
long-lived previous-major retention expectation so the platform can finish on a
single snake collection contract without a multi-version matrix.

Incremental delivery mounts `/api/v2` in an early child while class `name` is
still kebab, then renames identity (and thus path orthography) in a later
sibling. That sequencing keeps stories manageable and avoids a v2 spelling
shim. Human ruling (#186): early v2 goes in **dark** (tests only; no endorsed
in-app consumer) until later children; ADR text must make that window explicit
so it is not mistaken for a general same-major break waiver under ADR 009 §3.

## Decision

This ADR **amends ADR 013** and records a **one-time exception to ADR 009**
limited to epic #150 and its children.

### Amendments to ADR 013

1. **Functional-identifier principle.** Apply `snake_case` to every product name
   whose primary purpose is functional identity and that could reasonably appear
   as an identifier in code or code-like expressions. Do not apply it to text
   whose primary purpose is readability or aesthetics (display labels, prose,
   human-facing list URL slugs derived from labels). PascalCase for
   language/runtime class *type* names remains a compatible counterexample.
2. **Closed functional vocabularies.** Attribute `type` tokens and search `op`
   tokens are functional identifiers and **must** use `snake_case` (ADR 013’s
   prior carve-out leaving them kebab is withdrawn).
3. **No dual-accept window.** Loaders, validators, and generators fail closed on
   non-snake forms for in-scope functional-identifier fields after cutover.
   ADR 013’s allowance for a temporary dual-accept window is withdrawn for this
   cutover. (Role names and general nav data values are not in that enforced
   set—see ADR 015.)
4. **System-config and related YAML identity** (including attribute names landed
   under prior kebab rules) migrate with the epic; they are not deferred.

### One-time exception to ADR 009 (epic #150 only)

5. ADR 009 remains the default rule for public domain HTTP APIs. In particular,
   ADR 009 §3 (incompatible change increments major) is **not** generally
   waived for majors that already have endorsed consumers.
6. For **epic #150 and its children only**, the ordinary expectation that the
   previous major remain available for a long documented deprecation period is
   waived in favour of:
   - Introduce a **new major** (expected `/api/v2`) whose collection path
     segments use the class `name` directly with **no pluralization** and
     **no** kebab↔snake path shim (ADR 015). The stable v2 rule is
     **path = live `name`**, not a frozen orthography string.
   - Early children may mount that major while live `name` is still kebab
     (**dark** introduction: exercised by tests; not an endorsed in-app or
     external consumer contract). Pre-snake spelling on `/api/v2` is **not** a
     freezeable public contract. When the identity-rename child lands, path
     orthography follows snake `name` automatically.
   - Endorsed FE (or other product) cutover to `/api/v2` must occur **only
     after** the identity-rename child. That ordering—not “unused routes may
     break freely”—is what keeps this window from watering down ADR 009 §3.
   - Keep legacy unversioned and `/api/v1` kebab collection mounts only for the
     short coexistence needed while the epic’s children land.
   - **Remove** those legacy and `/api/v1` mounts as the **last child** of the
     epic by unmounting and **deleting the old version factory/module(s)**
     (ADR 015)—not by pruning `surface=` branches in a shared multi-major
     factory.
7. When that last child merges and the epic is closed, this exception is
   **closed**. It does not authorise future tickets to skip ADR 009 retention,
   linked removal issues, documented deprecation, or same-major breaking
   renames for endorsed contracts without a new human ruling and ADR.
8. Create (and delete-for-parity as needed) on the **v2 / new major** must
   include **create response FK enrichment** in the same child that introduces
   that major, so enrichment is not a further major bump.
9. Permission key class segments cut over in the **same** change as class
   `name` migration (ADR 015).

## Alternatives Considered

- **Keep ADR 013 carve-outs (`type`/`op` kebab; temporary dual-accept).**
  Rejected by human ruling: those tokens are code-facing identity; dual-accept
  entrenches incompatible forms.
- **Full ADR 009 retention of `/api/v1` kebab for a long deprecation window.**
  Rejected by human ruling for this epic: prefer a short coexistence and a
  single end-state contract; coordinate parallel work by heads-up.
- **In-place rename under `/api/v1` without a new major.** Rejected: still a
  breaking public path change; a new major remains the introduction vehicle
  even under the shortened retention exception.
- **Ship the new major’s create without FK enrichment, enrich later.**
  Rejected: would force another major solely for create parity.
- **Retire majors via `surface=` branch pruning in one factory.** Rejected by
  later human ruling (ADR 015): use versioned factories optimized for deletion.
- **Resequence so snake identity lands before or with first `/api/v2` mounts.**
  Rejected by human ruling for epic manageability: keep incremental children;
  dark kebab-on-v2 until rename is intentional.
- **Mount v2 using a `name_snake` (or similar) path while YAML `name` stays
  kebab.** Rejected: that is a spelling shim, not live-`name` paths (ADR 015).
- **Treat “no consumers yet” alone as licence to break any same-major path.**
  Rejected: the epic-scoped rule is path = live `name` plus dark / pre-endorsed
  cutover ordering—not a general ADR 009 §3 waiver.

## Consequences

- ADR 013 decision points on dual-accept, `type`/`op` carve-out, and “no waiver
  of ADR 009” are superseded by this ADR where they conflict; read ADR 013
  together with this amendment and ADR 015.
- ADR 009’s general retention, linked-removal, and same-major break rules are
  unchanged for all work outside epic #150; the dark live-`name` window does
  not generalise.
- Epic #150’s final child is the removal vehicle that ADR 009 would otherwise
  expect as a separate deprecation follow-up for this cutover; removal deletes
  the old factory/module(s).
- Out-of-repo clients and grants still break on permission spelling and on path
  retirement; permission class segments move with class `name`; parallel
  developers need an explicit heads-up that pre-snake `/api/v2` spelling is
  dark and not freezeable.
- Domain record field *values* and role `name` values remain data outside
  functional-identifier enforcement unless later reclassified (ADR 015).
- Primary agents must include this ADR (and amended ADR 013 / ADR 015 text) in
  commits with the work that introduced them; the human should be informed
  (may warrant later `review-arch`).
