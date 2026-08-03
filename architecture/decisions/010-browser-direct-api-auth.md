# Browser API authentication does not require an SSR proxy

## Context

ADR 002 made the SSR web tier a mandatory hop for browser-originated API traffic so that access tokens would remain inaccessible to browser JavaScript. Security review finding FND-017 confirmed that this also concentrates plaintext login credentials, access tokens in flight, and session-signing authority in the SSR process. The mandatory proxy additionally risks duplicating API-facing behavior across the SSR and API processes as browser-interactive features grow.

The security-design review determined that keeping credentials out of JavaScript does not require every browser API call to pass through SSR. A browser can automatically attach a secure `httpOnly` credential to an API request without exposing that credential to JavaScript.

## Decision

Browser-originated API calls must be able to reach the API without an application-level SSR proxy while authentication credentials remain inaccessible to browser JavaScript.

1. Browser credentials remain `Secure` and `HttpOnly`; no access token, session credential, or equivalent bearer material may be exposed to JavaScript storage, application state, rendered markup, or hydration data.
2. The API independently authenticates browser-originated requests. Non-browser clients may continue to use the Bearer API contract.
3. The browser authentication design must include CSRF protection, restrictive origin handling, and cookie scope appropriate to its deployment topology.
4. The SSR process must not hold credential-signing authority merely to support browser sessions. The selected design must minimize the credentials and plaintext authentication material available to an SSR compromise.
5. The exact browser credential mechanism remains a security-design validation item. JWT cookies, opaque server-side sessions, or another mechanism are acceptable only if they meet the outcomes above and have an explicit revocation and failure model.

This supersedes ADR 002's permanent mandatory-hop decision and its rejection of direct browser-to-API calls. ADR 002's prohibition on JavaScript-readable credentials remains in force until incorporated into a future consolidated decision.

## Alternatives Considered

- **Retain the mandatory SSR proxy.** Rejected as the long-term direction because it preserves the credential concentration and requires browser API behavior to be duplicated through SSR routes.
- **Expose a Bearer token to browser JavaScript.** Rejected because any script execution would gain the credential.
- **Select JWT-cookie or opaque-session mechanics now.** Deferred because cookie topology, CSRF handling, SSR data-loading needs, revocation, and deployment routing require focused validation before choosing the mechanism.

## Consequences

- Browser-interactive features may call API endpoints directly without corresponding SSR resource-route wrappers.
- The API gains a browser authentication mode in addition to Bearer authentication and must keep their authorization semantics aligned.
- Cookie-authenticated unsafe requests require explicit CSRF and origin controls; `httpOnly` alone does not provide them.
- Removing the mandatory proxy reduces SSR credential concentration but does not automatically eliminate it. Any credential also sent to SSR remains exposed to compromise of that process.
- The existing implementation may remain while the replacement mechanism is designed, but new work must not deepen reliance on the mandatory SSR proxy as a permanent architecture.
