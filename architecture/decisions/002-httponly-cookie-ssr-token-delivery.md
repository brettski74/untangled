# Access tokens reach the browser only as an httpOnly cookie; browser-originated API traffic goes through SSR routes

## Context

Unknown **U9** asked how the SSR web app should carry credentials — cookie versus Bearer —
and warned that the auth shape must not need a rewrite later. Issue #64 (shell UI login and
access-JWT gate) forced the question: the web tier now has to hold an access JWT across
requests so SSR loaders and actions can call the API as the signed-in operator.

The #64 plan settled on a signed session cookie holding only the access token, with the API
contract unchanged (still Bearer JWT on the wire between web tier and API). The risk raised
in architecture review was that a later ticket wanting browser-originated calls — the omnibox
in #15 is the obvious one — would take the easy path of exposing the JWT to JavaScript, which
would undo the httpOnly posture and turn a delivery choice into a rewrite.

The human architect approved recording the resulting constraint so later tickets inherit it
rather than rediscovering it.

## Decision

The access token is delivered to the browser **only** as an `httpOnly` session cookie, and
that is permanent, not a #64-scoped expedient.

1. The session cookie stays `httpOnly`. No code path may place the access token where
   JavaScript can read it — not `localStorage`, not `sessionStorage`, not a non-`httpOnly`
   cookie, not an inlined value in SSR-rendered markup or hydration payloads.
2. Browser-originated API needs are served by **SSR resource routes and route
   loaders/actions** on the web tier, which attach the Bearer token server-side. The browser
   never holds the credential it is implicitly using.
3. The API contract is unchanged: the web tier authenticates to the API with
   `Authorization: Bearer <access_token>`. The cookie is a web-tier delivery mechanism, not a
   second API auth scheme.
4. Cookie attributes are part of the decision, not incidental: `httpOnly`, `secure` on by
   default with plain-HTTP local development opting out explicitly, `sameSite` at least
   `lax`, path-scoped, and a `maxAge` that does not outlive the access token — derived from
   the token's own `exp` claim rather than from a separately configured TTL, so there is one
   source of truth for lifetime. `sameSite` is the CSRF defence for same-origin SSR form
   actions; a dedicated CSRF token scheme is not required while that holds, and any future
   route shape that breaks the same-site assumption must revisit it.
5. The cookie signing secret is required at runtime, with no in-code default. The web tier
   fails closed on every request: required configuration is asserted in the root loader, and
   the session helper refuses to build storage without the secret. This is deliberately not a
   claim of process-boot validation — `react-router-serve` offers no boot hook without a
   custom server entry, so a misconfigured deployment fails on first request rather than at
   startup. Readiness probes must therefore target a route that exercises the root loader.
6. Web-tier environment variables carry the `UNTANGLED_` prefix, matching the API tier:
   `UNTANGLED_SESSION_SECRET`, `UNTANGLED_API_BASE_URL`, `UNTANGLED_COOKIE_SECURE`. One
   deployment should not require operators to remember two naming conventions.

This **partially** settles U9: it fixes the delivery shape for the SSR app. It does not
resolve the production HTTPS/deployment half of U9, and it does not resolve the broader token
and session questions below.

### Deferred: fuller security architecture and hardening review

The human ruled this a **fast follow-up**, possibly beyond #14, explicitly not blocking #64
and explicitly out of scope for this ADR. It is tracked as **#67** (security architecture and
hardening review, auth). Carried forward for that review:

- HMAC HS256 versus ES256 or other private-key signature schemes
- Permission-change propagation and immediate revocation versus waiting out the access-token
  TTL — for example a monotonic permissions version carried in the token
- JWT signing key management (storage, rotation, distribution)
- JWT versus opaque session identifiers
- Browser-side security beyond this ticket's cookie gate, including login CSRF (which
  `sameSite` does not cover, since the login POST needs no cookie) and whether
  `Cache-Control: private, no-store` on authenticated responses should be systemic rather
  than set per route

## Alternatives Considered

- **Bearer token held in browser JavaScript (`localStorage` or memory).** Rejected: exposes
  the credential to any XSS in the app or its dependency tree, and gains nothing while SSR
  can attach the token server-side. This is the path the constraint exists to foreclose.
- **Readable (non-`httpOnly`) cookie.** Rejected: same XSS exposure as above with no
  compensating benefit; the only reason to make it readable is client-side fetch, which
  resource routes already cover.
- **Direct browser-to-API calls with CORS.** Rejected for now: requires exposing the token to
  the browser, plus a CORS surface and a second client auth path, contradicting the recorded
  preference for avoiding dual client paths. Deferred with the delivery question, not
  permanently foreclosed for a future design that keeps the credential out of JavaScript.
- **Opaque server-side session with no JWT in the cookie.** Not rejected on merit — it is a
  legitimate option, but it changes the API auth contract and belongs to the deferred
  security review rather than to #64.

## Consequences

- Later tickets inherit a hard constraint: #14 (refresh) changes how the token is renewed
  behind the cookie, and #15 (omnibox) must route interactive fetches through SSR resource
  routes. Neither may reach for browser-held tokens.
- The web tier becomes a mandatory hop for all authenticated browser traffic. That is an
  extra round trip on interactive paths and a scaling consideration for the web tier, which
  the performance-is-a-feature principle will eventually press on; resource routes must stay
  thin.
- Any future non-browser or third-party API client is unaffected — it authenticates to the
  API with Bearer directly, as today.
- U9 stays open in `unknowns.md` for its production HTTPS and deployment aspects. A later
  `review-arch` pass should narrow that entry to what remains rather than closing it.
- The deferred hardening list above is now recorded intent, not chat history; **#67** should
  be able to start from it.
- Deployment configuration is part of the security posture, not incidental packaging: the
  `UNTANGLED_` prefix, the secure-by-default cookie flag, and the fail-closed configuration
  assertion only hold if operators and later tickets keep them. A readiness probe pointed at
  a route that bypasses the root loader would silently reintroduce the misconfiguration gap.
