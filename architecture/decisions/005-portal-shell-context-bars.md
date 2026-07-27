# Shell context bars mount only via portal

## Context

Authenticated shell chrome includes a context-bar strip used by list (#76), detail (#81),
and future interactive destinations (for example new-record tools). Parallel work briefly
left **two delivery mechanisms** for the same strip: a portal + occupancy provider
(`ShellContextBar` into a layout host) for list page-local state, and a React Router
`handle.render_context_bar` + `useMatches` path for detail. Layout branched on occupancy
so only one painted — a merge-time compromise, not the intended contract.

List chrome needs route-owned interactive state (quick filter, shared search with the list
body). A portal keeps that tree under the route while painting into shell chrome. Detail
can use the same mount with its own `loaderData` and hooks; reverse-migrating list onto
`handle` would force lifting or duplicating that state into layout. A wrapper that kept
both producers would preserve dual wiring under a new name.

Consistency-above-all and progressive complexity require one chrome contract so later
destinations do not relearn or reintroduce a second path. Ticket #92 unifies the
implementation; this ADR records the standing policy beyond that ticket.

## Decision

The shell context-bar strip has **one** mount contract: portal into a single layout host
backed by the occupancy provider.

1. **Sole delivery path.** Route content mounts via the portal `ShellContextBar` (and its
   provider). There is one public API name and one layout integration. Do not deliver this
   strip through `handle.render_context_bar`, `useMatches`-selected handle renderers, or
   any second parallel mount system.
2. **Always-present host.** The layout host remains visible for authenticated chrome: inert
   decorative strip with `aria-hidden` when empty; portal target when a route opts in.
3. **Page-local state stays on the route.** Interactive chrome that must share state with
   the destination body (filters, draft tools, etc.) wraps content in the portal API under
   the route — do not lift that state into layout solely to feed a handle bar.
4. **Single occupant.** Only one route occupies the bar at a time (deepest / leaf). Nested
   routes both portaling is unsupported; occupancy must fail closed rather than silently
   stacking producers.
5. **Destination-agnostic labelling** when occupied (e.g. “Context bar”), not list- or
   detail-specific chrome names.
6. **React Router `handle` remains available** for unrelated route metadata. It is **not**
   the context-bar delivery mechanism and must not be reintroduced for this strip.

This is **standing shell chrome policy**, not a #92-only expedient. New destinations
(including new-form / edit tools) must use the portal contract.

## Alternatives Considered

- **Handle/`useMatches` as the sole mount; reverse-migrate list.** Rejected: list requires
  page-local shared state; handle cannot share that with the body without lifting into
  layout or another store — the constraint list already hit.
- **Keep both paths behind a shared provider or layout switch.** Rejected: preserves two
  producers and dual wiring; consistency requires one contract, not a wrapper over two.
- **Leave dual path until a design system lands.** Rejected: #92 and future destinations
  would keep inventing mount paths; silence invites naming collisions and layout branching.
- **Ticket-scoped unification without an ADR.** Rejected by human ruling: implementers of
  later chrome need an explicit standing standard to avoid reintroducing handle delivery.

## Consequences

- #92 and subsequent work must remove handle-based context-bar delivery and the duplicate
  `ShellContextBar` export; layout must not switch between portal and handle bars.
- Future interactive chrome (new-record tools, similar) uses the same portal wrapper;
  frontend docs may briefly describe the contract, but this ADR is the binding policy.
- SSR / first-paint behaviour must keep the always-visible empty strip (portal host is not
  allowed to drop decorative chrome when unoccupied).
- Later `review-arch` may promote a short pointer into `constraints.md` or `tradeoffs.md`;
  until then this ADR is the binding source for the rule.
- Primary agents must include this ADR file in commits with the work that introduced it; the
  human should be informed (may warrant later `review-arch`).
