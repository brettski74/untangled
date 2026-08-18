# Path-scoped opaque refresh and auth-only HMAC secret

## Context

Access credentials remain short-lived ES256 JWTs in an HttpOnly `__untangled_access` cookie (`Path=/`). Longer-lived session continuity needs an opaque refresh token. Dedicated-auth topology already isolates private signing from API and SSR; that decision left opaque refresh reuse and cookie confinement outside its scope.

If the refresh token used the same `Path=/` cookie posture as access, or were forwarded through SSR, an SSR compromise would yield a sliding multi-day credential rather than a ~15-minute JWT. Unkeyed fingerprints would let any process that can write the session table mint a usable stored refresh. Silently generating an HMAC secret at boot would violate fail-closed production credentials.

## Decision

1. **Opaque refresh, Path-scoped cookie.** Refresh tokens are not JWTs. The browser receives them only as HttpOnly, `SameSite=Lax`, `Secure` (per cookie-secure config), host-only cookie `__untangled_refresh` with **`Path=/api/v2/auth/refresh` only**. The raw token exists only in that cookie jar and in auth-process memory while handling refresh. It is never in a request body, JSON, logs, or JavaScript, and is never sent to SSR or the API. Browser refresh is `POST /api/v2/auth/refresh` with CSRF and exact Origin. There is no GET refresh. The public-origin edge MUST route that path to the auth service and nowhere else.

2. **HMAC-SHA-256, auth-only secret file.** Stored refresh material is HMAC-SHA-256 of the token. The HMAC secret lives only on the auth service, in a single file separate from ES256 keys. Missing or empty file → auth does not start (fail closed). The auth process MUST NOT generate a secret at boot. A Make target MAY create the file **when missing** (≥256-bit CSPRNG); it MUST NOT overwrite an existing file. That target is a dependency of every Make path that starts the auth container. Non-Make deploys provision the file. Do not commit the secret or bake a default into images. Replacing the secret invalidates all stored refresh HMACs.

## Alternatives Considered

- **`Path=/` refresh cookie (same as access):** Simpler cookie table, but SSR would receive a long-lived refresh on every document request — rejected as an unnecessary blast-radius increase.
- **SSR possession hop** (SSR reads refresh and POSTs JSON to auth): Enables document GET refresh without JS, but puts refresh plaintext in SSR and needs SSR database or equivalent — rejected. Document recovery is same-origin JS `POST` refresh.
- **Unkeyed SHA-256 (or JWT refresh, or Redis as the refresh store):** Unkeyed hashes do not bind stored material to an auth-only secret; JWT refresh and a second store were out of scope — rejected.
- **In-process generate if the secret file is missing:** Convenient locally, but production-capable boot would silently mint credentials — rejected in favour of fail-closed plus Make/operator provisioning.

## Consequences

- Refresh confinement depends on cookie Path **and** edge routing of `/api/v2/auth/refresh` to auth. Cookie Path is a prefix: do not mount other routes under that path.
- SSR and API can verify access JWTs with the public key; they cannot mint or verify stored refresh HMACs.
- U9 remains open for remaining cookie/CSRF/edge packaging; this ADR settles refresh Path and HMAC custody only. Access JWT `Path=/` is unchanged.
- Main constraint/tradeoff prose may still omit this until a later `review-arch` fold-in; this ADR governs until then.
