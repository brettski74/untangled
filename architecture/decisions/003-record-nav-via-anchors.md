# Record navigation uses real HTML hyperlinks

## Context

Issue #13 (list view) and related operator UI require opening records from list cells
(friendly-id and foreign-key values). Product requires that navigation be normal browser
hyperlinks — bookmarkable, copyable, and openable in a new tab — not JavaScript-only row
clicks or `navigate()` without an `href`.

Architecture docs previously said nothing about in-app record navigation. Without a
recorded rule, later surfaces (detail, omnibox, CMDB lists, related lists) can invent
inconsistent click-to-route patterns and break operator expectations and assistive /
browser affordances. Consistency-above-all and progressive complexity both push toward one
system-wide rule.

This does not change ADR 002: links target SSR app routes; authenticated domain API traffic
still goes through web-tier loaders/actions. The browser follows document navigation (or
framework `<Link>` that renders a real anchor); it does not gain a domain API client.

## Decision

In-app navigation to a **domain record’s detail URL** is expressed as a real HTML hyperlink
(`<a href="…">`, or a framework link component that renders one with a real `href`).

1. **Applies system-wide** to operator UI that opens a record by identity — including
   friendly-id cells, foreign-key cells that target another record, and equivalent
   affordances in lists, related lists, and similar chrome.
2. Links must support ordinary browser behaviour: bookmark, copy link address, open in new
   tab/window, middle-click, and standard keyboard activation — without a parallel
   pointer-only JS navigation path as the only way in.
3. **Href targets are SSR app routes** (e.g. `/:collection/:locator` or the pattern #71
   adopts), not domain API URLs. Credentialed domain I/O remains on the web tier (ADR 002).
4. Non-navigation controls (Execute, Refresh, sort headers, pagination, menus) remain
   buttons or other appropriate widgets; this decision does not force every interaction into
   an anchor.
5. Framework client-side routing is allowed **only** when the control still exposes a real
   `href` to the destination (e.g. React Router `<Link>`). `preventDefault` plus
   imperative navigate without a meaningful `href` is non-conformant for record opens.

## Alternatives Considered

- **JS-only row click / `navigate(path)` without `href`.** Rejected: breaks open-in-new-tab,
  copy-link, and bookmark; fragments accessibility and operator muscle memory across views.
- **Leave navigation unspecified until a design system lands.** Rejected: #13 already ships
  record links; silence invites incompatible patterns in #71 and later lists.
- **Allow either anchors or click handlers per screen.** Rejected: violates consistency;
  operators should not relearn how to open a record per surface.
- **Hyperlink directly to the domain API.** Rejected: contradicts ADR 002 and exposes the
  wrong contract (API vs app route) to the browser.

## Consequences

- #13 list friendly-id / FK cells, #71 detail entry points, and future record-opening UI
  must use real anchors to app detail URLs.
- Detail URL patterns must stay stable enough for hrefs emitted before the target screen
  ships (temporary 404 until #71 is acceptable if the contract is correct).
- Designers/implementers may still use row hover and dense tables; the *activation* path for
  opening a record is the link, not a row-level click handler that replaces it.
- Later `review-arch` may promote a short pointer into `constraints.md` or `principles.md`;
  until then this ADR is the binding source for the rule.
- Primary agents must include this ADR file in commits with the work that introduced it; the
  human should be informed (may warrant later `review-arch`).
