# Class-definition attribute declaration order is semantic

## Context

Issue #80 (slice 1 of epic #71) needed a default field layout for the detail and
new-record screens without inventing a separate layout configuration. It took the
declaration order of the attribute map in `backend/class-definitions/*.yaml` as that
default order, and emits an explicit 0-based `order` ordinal on generated field meta so
consumers do not have to trust incidental serialization order.

That is a change in what YAML attribute order *means*. Until now, mapping order in a class
definition was incidental: nothing read it, so a reformat, an alphabetical sort, or a
merge that reordered keys was a no-op. It is now load-bearing product behaviour, and it
sits against the recorded serialization rule that persisted JSON uses **stable key
ordering** — a canonicalizer or export path that reads that rule as "sort keys" would
silently rearrange every form in the product.

Architecture docs said nothing about layout ordering. Without a recorded rule, later
surfaces (detail, related lists, CMDB forms, customer-authored definitions) can each invent
their own answer — an explicit `display-order` key, alphabetical, or arbitrary emitter
order — which is the fragmentation that consistency-above-all exists to prevent. The same
reasoning produced ADR 003 for record navigation.

## Decision

Attribute declaration order in a class definition is **semantic**: it is the default
presentation order for that class wherever the system renders its attributes.

1. **Order is intent.** Reordering attributes in a class definition is a deliberate product
   change, reviewable as such in Git. Tooling — formatters, canonical serializers, export
   and promotion paths, merge helpers — must **preserve** attribute order and must never
   sort it. The "stable key ordering" serialization rule means deterministic, not
   alphabetized, for attribute maps.
2. **Order travels as an explicit ordinal.** Generated field meta carries a declared
   ordinal per attribute. Consumers order by that ordinal; they must not depend on array
   position, object key order, or JSON parse order surviving transport.
3. **Consumers fail closed.** A consumer that receives field meta without an ordinal must
   fail visibly rather than fall back to an invented sort (alphabetical, insertion, or
   emitter order). A silently wrong layout is worse than a loud one.
4. **One default ordering mechanism.** Layout that needs to differ from declaration order
   is a future explicit layout/view concern; it must not be introduced as a second
   competing ordering key on attributes themselves.
5. This is a **default**, not a lock: an explicit layout/form configuration may later
   override presentation order for a given view. Declaration order remains the fallback
   when no such configuration exists.

## Alternatives Considered

- **Leave order incidental and add an explicit `display-order` integer per attribute.**
  Rejected: redundant data entry against the optimize-for-laziness invariant, and it drifts
  — renumbering on every insertion is exactly the bookkeeping the product should absorb.
- **Alphabetical or emitter-determined order.** Rejected: produces layouts no author chose,
  and puts `assignment_group` before `summary` for no reason a user can act on.
- **Say nothing and let each surface decide.** Rejected: same failure mode ADR 003
  addressed — silence invites per-screen invention, and the first canonicalizer to sort
  keys becomes a silent product regression.
- **Record it only in `docs/class-definitions.md`.** Rejected as sufficient: docs own
  how-tos, not binding intent, so a note there does not bind later surfaces or tooling.
  The doc note should stay, pointing at this decision.

## Consequences

- Class-definition authors — including customers authoring their own definitions — now have
  a layout lever with no extra syntax, and no way to change layout accidentally without it
  showing in a diff.
- Any future canonical-serialization, promotion, or Git-config-engine work (U6, U7) must
  treat attribute maps as ordered sequences. This is a constraint on those designs, not an
  implementation detail of #80.
- Round-tripping definitions through anything that loses mapping order (naive dict handling,
  some YAML tooling, JSON object assumptions) is now a correctness bug rather than cosmetic.
  Tests should hold that line at the emitter boundary.
- The fail-closed rule needs teeth at runtime, not only in TypeScript types: generated field
  meta is data crossing a process boundary, so a static required field does not by itself
  satisfy point 3.
- A later `review-arch` may promote a short pointer into `constraints.md`; until then this
  ADR is the binding source.
- Primary agents must include this ADR file in commits with the work that introduced it; the
  human should be informed (may warrant later `review-arch`).
