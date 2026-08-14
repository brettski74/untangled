# Dedicated auth service (narrow JS/TS exception)

## Context

Epic #33 delivers login abuse controls, ES256 signing custody, password expiry / must-change, and browser credential handling. Product framing requires a **dedicated auth process** (not further deepening unauthenticated login work only inside the Python API monolith) and proposes **JavaScript/TypeScript** for that service so private signing keys and anonymous hash work stay isolated, and password-strength evaluation can share **zxcvbn-ts** with the browser.

Standing architecture chooses a **modular monolith first** (microservices are not the default starting point), **Python + FastAPI** as the primary backend, and `backend/` ownership of auth packages, with an instruction not to add parallel application roots casually. Target browser topology already requires same-origin path routing, no SSR credential-signing authority, and direct browser credentialed calls without an application-level SSR proxy—tradeoffs already anticipate asymmetric JWT verify enabling later auth extraction.

Those outcomes (signing-key isolation, separate scale/manage of unauthenticated auth work, credentials not transiting SSR) cannot be claimed as a standing platform shape while leaving monolith-only / Python-only constraints unmodified. A recorded carve-out is required so the exception stays narrow and reviewable.

## Decision

1. **Auth may be a dedicated service.** Login, access-token **signing**/issuance, password-verify abuse controls (rate limit, process-time padding, hash concurrency), and related browser session cookie set/clear for that flow MAY run in a separately deployable **auth service**, horizontally scalable apart from the Python API. Public-key **verification** of access JWTs MAY live in the API and in SSR as a **standing** capability (SSR needs it to refuse unauthenticated renders and to render authorization-aware UI). That is **not** an interim or bootstrap-only path. Private signing material MUST NOT be distributed to API or SSR merely to support sessions.

2. **Narrow JS/TS language exception.** That auth service MAY be implemented in **JavaScript/TypeScript**. Python remains the primary backend language for the platform. This does **not** authorize JS/TS (or new services) for unrelated domains.

3. **Same-origin edge only.** Browser clients MUST reach auth (and API) via **same-origin relative** paths on the single public origin. Production edge / TLS remains customer-owned; the product MAY ship a minimal Compose reverse-proxy profile for local/dev path routing to SSR, API, and auth. Do not publish internal multi-port auth URLs to the browser for credentialed calls.

4. **Repository layout.** A dedicated application root for this auth service (for example `auth/`) is permitted as part of this carve-out. It does not license additional parallel roots without a further decision.

5. **Non-goals preserved.** Modular monolith remains the default for other capabilities. Opaque refresh reuse/family revoke, global access-token kill-switch, and general microservice decomposition stay outside this decision (existing follow-ups / #67 as applicable).

## Alternatives Considered

- **Deepen Python monolith auth, extract later:** Meets short-term delivery with less topology change, but keeps signing keys and anonymous Argon2 in the API process and plans a known rewrite—rejected for #33’s isolation goals and PM sequencing.
- **Dedicated auth service in Python:** Achieves process isolation and key custody without a language exception; forgoes shared zxcvbn-ts and forces a second client-strength stack or a bridge. Retained as a viable alternative if the language carve-out is later overruled; not selected for this epic’s framing.
- **In-monolith isolation only** (queues/executors, no separate service): Can bound hash concurrency but does not isolate private signing keys or unauthenticated traffic management as a separate deployable—insufficient for the stated custody/scale outcomes.

## Consequences

- Ops and CI must run and secure a second runtime (Node/TS) alongside Python; dependency/SCA gates apply to both ecosystems for the auth artifact.
- Auth session HTTP surface moves with the service behind the path proxy; versioning and the auth-session coherence group must stay deliberate (no accidental dual login stacks).
- Browser cookie / CSRF design for auth-set cookies on the shared origin is security-critical and still subject to durable security-intent validation (SEC-SESS-003 / related WEB requirements)—this ADR authorizes topology, not a blank cheque on cookie attributes.
- SSR holding the **public** verify key is expected and permanent; it does not confer signing/minting capability. The constraint that SSR must not hold credential-**signing** authority still holds. The separately interim pattern is SSR attaching Bearer as an application-level API proxy—not SSR JWT verification.
- `boundaries.md` / main constraint prose still describe monolith Python auth until a later `review-arch` folds this carve-out in; this ADR governs until then.
- Pressure to “just add another JS service” must be refused without a new decision; the exception is auth-only.
