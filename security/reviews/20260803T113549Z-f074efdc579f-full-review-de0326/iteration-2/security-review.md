# Security Review — Sol Analysis

Status: Complete
Run ID: 20260803T113549Z-f074efdc579f-full-review-de0326
Iteration: 2
Assigned model (caller-supplied, not self-verified): gpt-5.6-sol-medium
Review mode: Full review
Prepared date: 2026-08-03

## 1. Input snapshot

| Input | Pinned value |
| --- | --- |
| Repository commit | `f074efdc579fb215ff6c86e466edce6d23c93e64` |
| Base ref | Not applicable |
| Target ref | Not applicable |
| Diff hash | Not applicable |
| Supplied diff | Not applicable |
| Threat-model revision | TM-REV-001 |
| Threat-model source commit | `f074efdc579fb215ff6c86e466edce6d23c93e64` |
| Threat-model SHA-256 | `5d27340e3e3e48d2a7e51a6163ccbebe920d7e5db9c8a273c89c663abc062adf` |
| Security-requirements revision | None |
| Security-requirements source commit | None |
| Security-requirements SHA-256 | None |
| Run manifest | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/manifest.md` |
| Iteration 1 security review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-1/security-review.md` |
| Iteration 1 security-review SHA-256 | `8374cb9303db2b9e9a5b0767ccdde9a2a5abb38859db45aac3943bf45cd608f5` |
| Iteration 1 adversarial review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-1/adversarial-review.md` |
| Iteration 1 adversarial-review SHA-256 | `10b95d7369c7d475cfe8760adf4a17e84fe3fd95423f869c712c593fc0c9fcd7` |

Validation completed before analysis: repository `HEAD` equals the pinned target commit; the accepted threat model is `Status: Accepted`, revision `TM-REV-001`, and its pinned Git object hashes to the manifest value; both prior artefacts hash to their supplied values; the manifest contract matches this invocation; and the output path was absent and is inside the supplied run directory.

## 2. Scope

### In scope

- Full accepted TM-REV-001 scope: the single-tenant, customer-hosted, internet-facing platform; implemented Milestone 1 API, SSR web tier, PostgreSQL persistence, authentication, class-wide RBAC, record APIs, predicate search, migration and seed CLIs, dependency inputs, and deployment defaults.
- Forward-looking configuration promotion, class tiers, SSO, recovery, administration, non-browser clients, customization runtime, event bus, integrations, discovery, and CMDB to the extent modelled by accepted intent.
- Stock implementation at the pinned repository commit.
- Every iteration-1 finding, withdrawn candidate, coverage claim, adversarial critique AR-001–AR-012, and eight missed-finding candidates.

### Explicit exclusions

- Physical and data-centre security; customer-owned host, network, load-balancer, Kubernetes, backup, and other infrastructure hardening.
- Vendor CI/CD; customer configuration CI/CD; customer forks; multi-tenant shared-database isolation.
- No additional exclusions.

### Components and attack surfaces examined

- Authentication, JWT and refresh-token handling, account lookup, RBAC dependencies, record routers, generated models, and request validation.
- Predicate compilation and execution, FK identity enrichment, pagination, SSR list forwarding, and database connection handling.
- Schema migration, restore points, seed paths, database role assumptions, class definitions, generated demo classes, and operator output.
- SSR login, redirects, cookie custody, API forwarding, authenticated layout headers, Dockerfiles, Compose, dependency lockfiles, and disclosure material.

### Scope limitations

- Static, read-only review. No process, database, HTTP target, destructive test, live deployment, production secret, or third party was used.
- No representative load test measured Argon2, worker-pool, regular-expression, predicate-amplification, count-query, or large-offset saturation thresholds.
- No built SSR response was captured, so whether loader-level `Cache-Control` reaches authenticated document responses remains unknown.
- No live dependency advisory, provenance, SBOM, image, or package-registry scan was performed.
- Customer production database-role design and TLS topology are out of repository evidence and customer infrastructure is excluded. Findings therefore distinguish the confirmed shipped defaults from unknown customer hardening.
- Forward-looking configuration, customization, SSO, recovery, event, integration, and CMDB surfaces have no implementation to trace; they remain coverage gaps, not executable-code findings.

## 3. Executive summary

### Overall assessment

The two Critical takeover paths from iteration 1 remain confirmed: a published HS256 signing-secret fallback permits forged administrative access tokens, and production-capable seed/database paths accept published credentials. Adversarial re-analysis increases the demonstrated blast radius of the database branch: the shipped Compose database principal is the PostgreSQL bootstrap superuser, the application runtime shares it, and migration unconditionally needs `pg_create_restore_point` privilege. A direct database or API-process compromise can therefore reach database-host command execution, not merely application data.

Nine High findings now cover authentication abuse, transport/browser hardening, class-wide extraction, amplified database exhaustion, weak accountability, anonymous schema exposure, dependency compromise, vulnerability notification, and shared superuser-equivalent database authority. The search path is materially more dangerous than iteration 1 described: one request can contain roughly 2,500 pattern leaves, the predicate is evaluated again by mandatory `COUNT(*)`, offset and sort-key count are unbounded, and the ordinary browser list action forwards those values.

Five new records preserve concerns that iteration 1 submerged or missed: shared superuser-equivalent database authority (SR-015), cross-class FK identity disclosure (SR-016), plaintext secret output from operator CLIs (SR-017), web-tier credential concentration (SR-018), and production-shipped demo scaffolding (SR-019). SR-005 is revised from Low to Medium because the open redirect needs only a crafted link and an existing session. SR-006 withdraws the unsupported assertion that document cache control is confirmed. No Sol/Opus security disagreement remains unresolved; five findings retain material evidence uncertainty.

### Highest-severity findings

- SR-001: a published HS256 fallback and weak required-claim validation permit arbitrary, potentially non-expiring administrative JWTs.
- SR-002: published bootstrap credentials can yield complete platform, database, and—under the shipped superuser role—database-container compromise.
- SR-003 and SR-008: anonymous login work and authenticated search amplification can deny the entire incident-management service.
- SR-007, SR-009, SR-015, SR-016, and SR-017 compose broad extraction or privileged compromise with weak attribution and secret leakage.

### Newly introduced or changed exposure

Not applicable — this is a full review of one pinned snapshot, not a diff-aware assessment.

### Pre-existing weaknesses requiring attention

- Every finding exists in the pinned snapshot. Full-review mode does not classify change provenance.
- The migration restore-point requirement makes simple role separation infeasible unless the product makes restore-point creation optional or separately privileges a migration identity.
- The v1 record surface already diverges from the legacy surface by enriching referenced content; authorization dependencies are parallel, disclosure behavior is not.
- TM-REV-001 accepts no individual risk. ADR 002 deliberately accepts SSR credential concentration as a trade only while it remains visible; SR-018 preserves and reassesses that decision.

### Material uncertainty

- Actual login and query exhaustion thresholds require representative local load tests.
- SSR document-level cache headers require a built response capture; the API tier's lack of systemic headers is statically confirmed.
- Customer production database-role and TLS controls may reduce likelihood but are not supplied and cannot be assumed.
- Dependency advisories and artifact provenance were not scanned.
- Configuration tiering, promotion, customization isolation and identity, recovery, SSO, integrations, and CMDB remain unimplemented design-stage surfaces.

## 4. Analysis method

### Threat-model coverage

The review treated AST-001–AST-012, ACT-001–ACT-015, TB-001–TB-014, ASM-001–ASM-026, and THR-001–THR-028 as hypotheses. Iteration 2 re-read every challenged call path rather than accepting either prior report. It sought prerequisites, reachable surfaces, preventive/detective/recovery controls, disconfirming evidence, legitimate-user misuse, and composed paths. Ratings use TM-REV-001 section 9 without elevation.

### Implementation evidence examined

| Evidence | Revision or location | Purpose |
| --- | --- | --- |
| Accepted threat model | Pinned Git object at target commit; hash verified | Governing scope, assets, boundaries, ratings, threats, and accepted decisions |
| Prior review artefacts | Iteration-1 Sol and Opus files; hashes verified | Stable IDs, challenges, disagreements, and audit continuity |
| Authentication and RBAC | `auth/**`, `rbac/**`, `request_validation.py`, related tests | Secrets, claims, login cost, sessions, account and permission checks |
| Records and search | `records/router_factory.py`, `records/search_models.py`, `persistence/search.py`, `fk_enrichment.py` | Projection, reference authorization, predicate amplification, count, sort, offset |
| Operator and schema paths | `schema/**`, `seed/**`, `persistence/connection.py`, `actor.py`, docs | Database privilege, restore points, defaults, output, destruction, attribution |
| SSR web tier | `frontend/app/auth/**`, login/authenticated/list routes | Cookie custody, redirect path, API forwarding, browser reachability, cache evidence |
| Deployment and supply chain | Compose, Dockerfiles, lockfiles, class definitions | Published defaults, root runtime, demo surfaces, dependency containment |
| Absence checks | Systemic headers, middleware, query timeout/pool, disclosure policy, tier/runtime code | Verify material negative claims |

### Standards used

| Standard | Specific section or control | Application |
| --- | --- | --- |
| OWASP ASVS 5.0 | V2, V3, V4, V7, V12, V14 | Authentication, session, access control, logging, transport, deployment |
| OWASP Top 10:2021 | A01, A02, A05, A07, A09 | Authorization, cryptography, defaults, login, audit |
| NIST SP 800-63B | Verifier throttling and session management | Login abuse and session termination |
| RFC 8725 | Sections 3.1 and 3.9 | JWT algorithm and required-claim validation |
| RFC 9700 | Refresh token replay protection | Rotation families and reuse response |
| PostgreSQL documentation | Restore-point and server-program privileges; regexp behavior | SR-008 and SR-015 |
| WHATWG URL Standard | Special-scheme backslash normalization | SR-005 |
| CWE | CWE-250, 307, 319, 532, 601, 613, 770, 778, 798, 829, 863, 1333, 1392 | Finding classification |

## 5. Rating method

Impact, likelihood, and overall priority use TM-REV-001 section 9. Severity equals the matrix result. No finding is elevated outside the matrix. `Informational` denotes a useful hardening or verification observation without a substantiated present exploit path. Confidence reflects evidence quality, not impact.

## 6. Finding summary

| Severity | ID | Finding | Provenance | Confidence | Related threats |
| --- | --- | --- | --- | --- | --- |
| Critical | SR-001 | Published signing-secret fallback permits arbitrary and potentially non-expiring administrative JWTs | Not applicable | High | THR-001, THR-006 |
| Critical | SR-002 | Production-capable seed and database paths accept published credentials | Not applicable | High | THR-002 |
| High | SR-003 | Login exposes unbounded authentication work to the shared API worker pool | Not applicable | High | THR-003, THR-004, THR-005 |
| Medium | SR-004 | Session termination and refresh replay response are incomplete | Not applicable | High | THR-006, THR-007 |
| Medium | SR-005 | Login CSRF and a one-click authenticated open redirect weaken login integrity | Not applicable | High | THR-008 |
| High | SR-006 | Browser, API, and transport hardening depend on unenforced deployment choices | Not applicable | Medium | THR-009, THR-023 |
| High | SR-007 | One class-read grant enables reliable, unrecorded whole-class extraction | Not applicable | High | THR-011, THR-012, THR-017 |
| High | SR-008 | Search amplification can exhaust the shared database | Not applicable | High | THR-013 |
| High | SR-009 | Direct database authority and weak audit identity defeat accountability | Not applicable | High | THR-014, THR-015, THR-017 |
| High | SR-010 | Anonymous callers receive the complete generated API schema | Not applicable | High | THR-016 |
| Medium | SR-011 | Destructive schema escape hatches bypass the safe migration default | Not applicable | Medium | THR-020 |
| High | SR-012 | Dependency compromise reaches root-running application containers | Not applicable | Medium | THR-021, THR-024 |
| High | SR-013 | Stock self-hosted releases lack a vulnerability-notification capability | Not applicable | High | THR-022 |
| Informational | SR-014 | Parallel legacy and v1 record surfaces create control-drift risk | Not applicable | High | THR-026 |
| High | SR-015 | Runtime, seed, and migration share a superuser-equivalent database role | Not applicable | High | THR-002, THR-014, THR-020, THR-021 |
| Medium | SR-016 | FK identity enrichment discloses referenced-class content without permission | Not applicable | High | THR-011, THR-012, THR-026 |
| Medium | SR-017 | Operator CLIs print live database and seed credentials | Not applicable | High | THR-002, THR-014, THR-017 |
| Medium | SR-018 | The SSR process concentrates all interactive credential material | Not applicable | High | THR-024, THR-028 |
| Informational | SR-019 | Demo schema, permissions, and RBAC probe ship in the production surface | Not applicable | High | THR-016 |

This table is derived from the detailed records below, which are authoritative.

## 7. Detailed findings

### SR-001 — Published signing-secret fallback permits arbitrary and potentially non-expiring administrative JWTs

- Iteration disposition: Revised
- Severity: Critical
- Impact: Critical
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Cryptographic failure / authentication bypass
- CWE or equivalent: CWE-798, CWE-321, CWE-613
- Related threats: THR-001, THR-006
- Related security requirements: None
- Prior acceptance or deferral: None; ASM-007 states fail-closed intent
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001–AST-006, AST-010
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-004, TB-005, TB-008
- Affected components: JWT settings, decoder, seed identity, RBAC

#### Claim

If the API uses the missing or published HS256 secret, any repository reader can mint an administrative access token. The decoder requires `sub` and `typ` but not `exp` or `iat`, so a forged token can omit expiry entirely.

#### Evidence

- `auth/settings.py:15-20` returns a published literal fallback; `compose.yaml:25-30` supplies the same value.
- `auth/tokens.py:27-33` mints `sub`, `iat`, `exp`, `typ`; lines 41-50 decode with an algorithm allowlist but no `options={"require": [...]}`, issuer, or audience.
- PyJWT 2.13 validates `exp` only when present by default.
- `seed/users.py:11-13` publishes the admin UUID; `auth/dependencies.py:43-51` and `rbac/dependencies.py:32-51` accept the active subject and resolve live admin authority.

#### Preconditions and attack path

1. The API uses the absent or copied development secret and the seeded admin remains active.
2. The attacker signs `{"sub": "<published-admin-uuid>", "typ": "access"}` with no `exp`.
3. The API validates it indefinitely, subject only to key rotation or account deactivation, and resolves current administrator permissions.

#### Legitimate-user abuse case

Any repository reader can test a deployment for the known key without an account.

#### Existing controls and disconfirming evidence

- Preventive: HS256 allowlist; active-user and live-permission resolution; product-minted tokens have expiry.
- Detective: None identified.
- Recovery: secret rotation or account deactivation.
- Disconfirming evidence: the web cookie secret fails closed, but direct API access bypasses the web tier. Claim validation does not require timing claims.

#### Impact justification

The path grants complete platform authority without credential theft; omitted expiry makes the forged token survive TTL changes.

#### Likelihood justification

The key and admin subject are public, startup is silent, and exploitation is one signed request.

#### Minimal effective recommendation

Require an explicit high-entropy key, reject known development values outside an explicit local mode, and require `sub`, `typ`, `iat`, and `exp`. Add issuer/audience binding when multiple keys or issuers exist.

#### Verification approach

Assert production startup fails for missing/known keys; assert tokens missing each required claim fail; assert a repository-key token is rejected.

#### Standards references

- OWASP ASVS V2; RFC 8725 sections 3.1 and 3.9; CWE-798.

#### Disagreement or uncertainty

- AR-012 accepted. The algorithm allowlist is valid; iteration 1's description of required timing claims was too broad.

### SR-002 — Production-capable seed and database paths accept published credentials

- Iteration disposition: Revised
- Severity: Critical
- Impact: Critical
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Default credentials / fail-open deployment
- CWE or equivalent: CWE-1392, CWE-798
- Related threats: THR-002
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-004–AST-006, AST-010, AST-011
- Relevant actors: ACT-005, ACT-011, ACT-012
- Trust boundaries: TB-004, TB-006–TB-008
- Affected components: seed CLI, database connection, Compose, RBAC

#### Claim

Production-capable paths can create a fixed allow-all administrator and connect to PostgreSQL using published credentials with no production guard. Under shipped Compose, the database principal is the bootstrap superuser, extending compromise to database-container command/file authority.

#### Evidence

- `seed/users.py:31-77` defines fixed identities and default passwords, including `admin-change-me`.
- `seed/cli.py:24-39` seeds without a production guard.
- `persistence/connection.py:9-20` silently defaults to `untangled:untangled`.
- `compose.yaml:4-11,22-32` provisions `POSTGRES_USER=untangled`, publishes PostgreSQL/API ports, and uses those credentials.
- `seed/rbac_catalog.py:118-125,168-173` grants admin allow-all.
- `schema/versions.py:58-66` confirms local Compose `untangled` is superuser-equivalent; SR-015 details privilege sharing.

#### Preconditions and attack path

1. An operator seeds without overrides or exposes a deployment using copied defaults.
2. An attacker logs in as admin or connects to PostgreSQL.
3. The attacker obtains complete application/database authority; on the shipped database role, server-program and server-file privileges are available.

#### Legitimate-user abuse case

An operator uses the documented defaults to make a deployment work, intending to rotate later; no control forces rotation.

#### Existing controls and disconfirming evidence

- Preventive: conspicuous `-change-me` names; environment overrides; seeding is deliberate.
- Detective: CLI output reports values but creates no durable event and itself leaks secrets (SR-017).
- Recovery: manual credential replacement and investigation.
- Disconfirming evidence: no environment classification, first-use change, known-default rejection, or production refusal exists.

#### Impact justification

Either branch yields system-wide compromise; the database branch bypasses application control and may reach database-container execution.

#### Likelihood justification

Public defaults and routine operational omission make exploitation readily repeatable.

#### Minimal effective recommendation

Fail closed on absent/known database and seed secrets outside a local fixture; generate unique bootstrap credentials, force controlled first-use change, and pair this with SR-015 role separation.

#### Verification approach

Assert production startup/seed fails before database mutation for absent or known values and that the runtime role cannot execute server programs.

#### Standards references

- OWASP ASVS V2/V12; OWASP A05; CWE-1392.

#### Disagreement or uncertainty

- AR-001 accepted on blast radius. The Critical severity remains unchanged.

### SR-003 — Login exposes unbounded authentication work to the shared API worker pool

- Iteration disposition: Revised
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Authentication abuse / denial of service / timing discrepancy
- CWE or equivalent: CWE-307, CWE-208, CWE-770
- Related threats: THR-003, THR-004, THR-005
- Related security requirements: None
- Prior acceptance or deferral: ASM-006; issue #33
- Prior-decision reassessment: Still supported
- Affected assets: AST-001, AST-002, AST-011
- Relevant actors: ACT-001, ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004, TB-006
- Affected components: login, form parsing, Argon2, shared synchronous route pool

#### Claim

Anonymous callers can make unlimited login attempts with no request-body or password-length bound. Known active usernames trigger Argon2 while unknown/inactive users return early. All API routes are synchronous and share the bounded AnyIO worker pool, so login work can deny record traffic as well as authenticate guesses and expose coarse username timing.

#### Evidence

- `auth/routes.py:42-52` defines an unthrottled synchronous login using `OAuth2PasswordRequestForm`.
- `auth/passwords.py:5-21` uses `PasswordHasher()` defaults; `auth/store.py:55-62` returns before hashing for unknown/inactive users.
- Record handlers in `records/router_factory.py:47,85,160,180,200` are also synchronous.
- `backend/Dockerfile:27` sets no concurrency limit; `main.py` registers no limiting middleware.
- No body limit, password-length cap, rate limiter, lockout, auth-event log, or hash concurrency budget was found.

#### Preconditions and attack path

1. The internet login is reachable; the admin username is public.
2. Concurrent large form requests for a valid username buffer input and perform Argon2 work.
3. Worker threads, CPU, memory, and per-request database connections are consumed; authenticated routes queue behind the same pool.

#### Legitimate-user abuse case

An insider can grind another user's password through the normal endpoint without a security event.

#### Existing controls and disconfirming evidence

- Preventive: Argon2id raises guess cost; generic response; inactive users fail.
- Detective: None identified.
- Recovery: process/orchestrator restart.
- Disconfirming evidence: the early return reduces unknown-user work but creates enumeration. A dummy hash alone would increase attacker work unless input is bounded first.

#### Impact justification

Credential compromise inherits broad class authority; pool saturation removes the incident-management service.

#### Likelihood justification

No credential is required, usernames are known/enumerable, and the shared pool gives each expensive login cross-route impact.

#### Minimal effective recommendation

Bound HTTP body and password length before hashing; add failure-safe per-account/source throttles and a global hash-concurrency budget or isolated execution; then use a fixed dummy verification and emit privacy-conscious auth events.

#### Verification approach

Use a local representative fixture to measure known/unknown timing and concurrent oversized-password behavior; assert body rejection, bounded hash concurrency, stable backoff, and responsive control/record routes.

#### Standards references

- NIST SP 800-63B; OWASP ASVS V2/V13; CWE-307/CWE-770.

#### Disagreement or uncertainty

- AR-004 accepted. Saturation thresholds and exact framework body behavior under deployment remain unmeasured.

### SR-004 — Session termination and refresh replay response are incomplete

- Iteration disposition: Revised
- Severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Session management / token replay
- CWE or equivalent: CWE-613
- Related threats: THR-006, THR-007
- Related security requirements: None
- Prior acceptance or deferral: Token revocation deferred; issue #67
- Prior-decision reassessment: Conditions changed only by clarified claim validation
- Affected assets: AST-001, AST-002
- Relevant actors: ACT-009, ACT-011, ACT-013
- Trust boundaries: TB-002–TB-004
- Affected components: JWTs, refresh store, SSR login/logout

#### Claim

Logout cannot terminate access JWTs; TTLs have no ceiling; token validation does not require expiry; refresh rotation detects only current validity, not family reuse; and the SSR discards the refresh token but leaves its row active until expiry.

#### Evidence

- `auth/tokens.py:23-50` has no `jti` and no required-claim list.
- `auth/settings.py:23-30` accepts unbounded TTLs.
- `auth/store.py:74-87,138-160` atomically rotates but records no family/reuse event.
- `auth/routes.py:68-71` revokes only a presented refresh token.
- `frontend/app/auth/api.server.ts:22-50` discards refresh; `logout.tsx` destroys only the cookie.
- Per-request active-user and RBAC checks promptly stop deactivated/revoked authority.

#### Preconditions and attack path

1. An attacker obtains an access or future non-browser refresh token.
2. Logout does not terminate access; replay does not invalidate the refresh family.
3. The attacker continues until expiry, indefinitely for a forged token without `exp`, or keeps a refresh chain alive.

#### Legitimate-user abuse case

A departing user uses a captured token during its remaining validity.

#### Existing controls and disconfirming evidence

- Preventive: short default access TTL; opaque digest-only refresh tokens; atomic rotation; live account/permission checks.
- Detective: None for replay.
- Recovery: account deactivation immediately blocks requests; key rotation invalidates JWTs.
- Disconfirming evidence: refresh exposure is presently low because the SSR discards it.

#### Impact justification

Ordinary product tokens are time-bounded and authority is live-resolved, limiting scope versus permanent stale authorization.

#### Likelihood justification

Token capture requires another foothold; non-browser refresh clients are not implemented.

#### Minimal effective recommendation

Require and ceiling timing claims; add deliberate access-session revocation, refresh-family lineage/reuse response, security events, and consistent SSR issuance/revocation behavior.

#### Verification approach

Test missing claims, issue/rotate/replay/logout/deactivate/revoke flows and assert both denial and security events.

#### Standards references

- RFC 9700; RFC 8725; NIST SP 800-63B; OWASP ASVS V3.

#### Disagreement or uncertainty

- AR-012 accepted; no separate finding is needed because required claims directly strengthen this control.

### SR-005 — Login CSRF and a one-click authenticated open redirect weaken login integrity

- Iteration disposition: Revised
- Severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Login CSRF / open redirect
- CWE or equivalent: CWE-352, CWE-601
- Related threats: THR-008
- Related security requirements: None
- Prior acceptance or deferral: Login CSRF deferred under ADR 002; redirect bypass was not considered
- Prior-decision reassessment: Conditions changed
- Affected assets: AST-001, AST-002, AST-004, AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-002
- Affected components: login loader/action, `safe_next_path`

#### Claim

The login POST lacks CSRF/origin control, enabling forced login to an attacker account. Independently, `safe_next_path` accepts `/\host`; WHATWG normalization makes it cross-origin. An already authenticated victim follows one genuine-domain link and the login loader redirects immediately to the attacker.

#### Evidence

- `frontend/app/routes/login.tsx:16-24` redirects an existing session to the accepted `next`; lines 26-54 commit login with no CSRF/origin check.
- `frontend/app/auth/next_path.ts:5-15` checks forward slashes and `://` but not backslashes.
- Existing tests cover ordinary absolute/protocol-relative URLs, not backslashes.
- The host-scoped `httpOnly`, `sameSite=lax` cookie is not sent to the attacker origin.

#### Preconditions and attack path

1. Redirect path: a signed-in operator clicks `/login?next=%2F%5Cattacker.example%2Flogin`.
2. The loader accepts and redirects; the browser normalizes to the attacker origin, enabling trusted-domain phishing.
3. CSRF path: a hostile page submits attacker credentials; the victim later enters data into the attacker's session.

#### Legitimate-user abuse case

An account holder can induce another operator to work in the wrong session.

#### Existing controls and disconfirming evidence

- Preventive: `sameSite=lax`, `httpOnly`, secure-by-default cookie, React escaping, ordinary `//`/absolute rejection.
- Detective: None identified.
- Recovery: sign out and clear the session.
- Disconfirming evidence: cookie custody prevents direct token disclosure; the redirect still supports phishing.

#### Impact justification

The paths support credential phishing, account confusion, and misdirected record entry, but do not by themselves bypass API authorization.

#### Likelihood justification

CSRF retains Low likelihood; the open redirect has Medium likelihood because it requires only one crafted link and an existing session. The merged finding uses the higher applicable matrix result.

#### Minimal effective recommendation

Require a login Origin/CSRF check and parse redirects against a fixed trusted origin, accepting only same-origin paths with normalized separators.

#### Verification approach

Table-test backslashes, encodings, controls, mixed schemes, and loader/action behavior; test cross-origin login forms.

#### Standards references

- OWASP ASVS V3/V5; CWE-352; CWE-601; WHATWG URL Standard.

#### Disagreement or uncertainty

- AR-007 accepted. The redirect half drives the revised Medium severity.

### SR-006 — Browser, API, and transport hardening depend on unenforced deployment choices

- Iteration disposition: Revised
- Severity: High
- Impact: High
- Likelihood: Medium
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Security category: Transport security / browser hardening / deployment misconfiguration
- CWE or equivalent: CWE-16, CWE-319
- Related threats: THR-009, THR-023
- Related security requirements: None
- Prior acceptance or deferral: TLS ownership and systemic cache handling remain open
- Prior-decision reassessment: Still supported
- Affected assets: AST-001–AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001–TB-003, TB-008
- Affected components: SSR/API headers, cookie configuration, Compose transport

#### Claim

The product does not systemically assert HTTPS, HSTS, CSP, framing, MIME-sniffing, or cache protection. Compose disables `Secure`, uses plain HTTP for Bearer forwarding, and exposes the API. A loader requests `private, no-store`, but repository evidence does not establish that it reaches SSR document responses.

#### Evidence

- `compose.yaml:47-54` uses `http://api:8000`, a published session secret, and `UNTANGLED_COOKIE_SECURE=false`; API port 8000 is published.
- `config.server.ts:25-45` defaults `Secure` on but accepts false in every environment; `session.server.ts:36-45` otherwise uses strong attributes.
- `routes/authenticated.tsx:36-39` sets a loader `data()` header; no frontend route exports `headers`; its unit test inspects the loader object, not a built response.
- `main.py` registers no security/cache middleware. Repository searches found no CSP, HSTS, framing, or MIME policy.

#### Preconditions and attack path

1. Development transport settings reach an internet deployment, or an authenticated response traverses a shared cache.
2. Cookies/Bearer tokens traverse plaintext, documents may be cached, or browser containment against framing/injection is absent.
3. A network-positioned or composed browser attacker captures or acts through an operator session.

#### Legitimate-user abuse case

An operator disables secure cookies for a pilot and exposes it later without restoring transport protection.

#### Existing controls and disconfirming evidence

- Preventive: `Secure` defaults true; cookie is host-scoped, `httpOnly`, `sameSite=lax`; authenticated loader requests no-store.
- Detective: None identified.
- Recovery: rotate both session and JWT secrets.
- Disconfirming evidence: customer TLS may mitigate but is excluded; document-level cache propagation is unverified, not credited.

#### Impact justification

Captured credentials permit impersonation; missing containment amplifies injection/UI-redress; cached operational data may cross users.

#### Likelihood justification

Requires deployment error, cache behavior, or network position; safe cookie default reduces but does not remove the prerequisite.

#### Minimal effective recommendation

Define a production mode that refuses insecure cookie/API transport, apply systemic web and API security/cache headers, and supply CSP compatible with required assets.

#### Verification approach

Capture raw production SSR document/data and API responses; assert transport assumptions, HSTS at the responsible layer, CSP, framing, MIME, and private/no-store behavior.

#### Standards references

- OWASP ASVS V3/V12/V14; OWASP Secure Headers guidance.

#### Disagreement or uncertainty

- AR-006 accepted. The iteration-1 cache-control narrowing is withdrawn. Runtime document behavior and customer topology remain unknown.

### SR-007 — One class-read grant enables reliable, unrecorded whole-class extraction

- Iteration disposition: Confirmed
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Broken access control / bulk exfiltration
- CWE or equivalent: CWE-862, CWE-200
- Related threats: THR-011, THR-012, THR-017
- Related security requirements: None
- Prior acceptance or deferral: ASM-019/ASM-025 describe future direction only
- Prior-decision reassessment: Conditions unchanged
- Affected assets: AST-004, AST-005, AST-009, AST-012
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Affected components: RBAC, record fetch/search, audit fields

#### Claim

Authorization checks only `{class}:read`; a holder can project any source field, match every row, page deterministically using `total`, and leave no read event. No row or attribute constraint exists.

#### Evidence

- `rbac/dependencies.py:32-51` checks one class-operation key.
- `records/router_factory.py:77-175` applies it once to search/fetch.
- `persistence/search.py:137-179,231-259,284-326` exposes mapped attributes, `WHERE TRUE`, mandatory total, stable sort, limit 200, arbitrary offset.
- Tests verify match-all and pagination; no read audit or cumulative volume detection was found.
- Cross-class enrichment is separated into SR-016 rather than hidden here.

#### Preconditions and attack path

1. A legitimate or compromised account holds one class-read permission.
2. It requests all fields with no predicate and pages by offset.
3. It extracts the full class without a read security event.

#### Legitimate-user abuse case

A departing operator exports the corpus entirely within granted permission.

#### Existing controls and disconfirming evidence

- Preventive: consistent class RBAC; 200-row response cap; validated attributes; parameterized SQL.
- Detective: None for reads/cumulative volume.
- Recovery: revoke future access; copied data cannot be recovered.
- Disconfirming evidence: no row predicate, field policy, cumulative quota, export gate, or read log exists.

#### Impact justification

One ordinary credential discloses an operational class and future infrastructure intelligence, with no breach scoping.

#### Likelihood justification

The API is deterministic and scriptable; no bypass is required.

#### Minimal effective recommendation

Enforce row/attribute authorization at common resolution boundaries with non-existence semantics and add attributable bulk-read events and volume controls.

#### Verification approach

Test restricted principals across fetch, projection, predicate, sort, count, legacy/v1, and metadata surfaces.

#### Standards references

- OWASP ASVS V4/V7; OWASP A01; CWE-862.

#### Disagreement or uncertainty

- AR-002 does not disprove SR-007; it substantiates the distinct cross-class SR-016.

### SR-008 — Search amplification can exhaust the shared database

- Iteration disposition: Revised
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Algorithmic complexity / uncontrolled resource consumption
- CWE or equivalent: CWE-1333, CWE-770
- Related threats: THR-013
- Related security requirements: None
- Prior acceptance or deferral: THR-013 keeps regexp but requires mitigation
- Prior-decision reassessment: Still supported
- Affected assets: AST-010, AST-011
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Affected components: search model/compiler, browser list action, PostgreSQL connection

#### Claim

One class reader can submit roughly 2,500 arbitrary PostgreSQL regexp leaves in one request. The same predicate is evaluated by an unconditional full-class `COUNT(*)` and again by the SELECT. Pattern size, total predicate count, sort-key count, offset, statement time, query budget, rate, and connection concurrency are unbounded.

#### Evidence

- `persistence/search.py:26-30,354-357,405-436` permits depth 3 and 50 children at each of two logical levels.
- Lines 172-179 and 231-239 compile/execute the predicate for COUNT and SELECT.
- Lines 274-281 and `records/search_models.py:57` bound offset only below; `_resolve_sort` has no list bound or deduplication.
- Lines 540-584 pass regexp to PostgreSQL and create leading-wildcard LIKE.
- `destination_list.tsx:195-222` and `pagination.ts:154-186` make predicate/large safe-integer offset browser-reachable.
- No statement timeout, pool, cost budget, pattern bound, or per-principal throttle was found.

#### Preconditions and attack path

1. A browser or API user holds one class-read permission.
2. One predicate contains fifty logical groups of fifty non-matching expensive regex leaves.
3. PostgreSQL evaluates them across the class for COUNT and again for SELECT; concurrent requests or a huge sorted offset compound work.

#### Legitimate-user abuse case

An operator runs a broad filter or pages deeply through a mature corpus and triggers the same expensive plan.

#### Existing controls and disconfirming evidence

- Preventive: parameterization; response limit 200; depth/list bounds; invalid-regexp rollback; LIKE metacharacters escaped.
- Detective: None identified.
- Recovery: query/process termination or external database intervention.
- Disconfirming evidence: response limit does not constrain COUNT; nesting limits positively permit the multiplier.

#### Impact justification

The shared database is the availability dependency for an incident-response platform.

#### Likelihood justification

One ordinary read permission and potentially one request suffice; no token extraction is needed through the SSR list action.

#### Minimal effective recommendation

Set interactive statement timeouts; cap total predicates, pattern length/complexity, sort keys, and offset; apply principal query budgets and bounded pooling; gate especially expensive operators as needed.

#### Verification approach

Load-test representative data with maximum trees, adversarial regex, COUNT, and deep offsets; assert timeouts, connection bounds, and responsive control traffic.

#### Standards references

- OWASP ASVS V5/V13; CWE-1333; CWE-770.

#### Disagreement or uncertainty

- AR-005 accepted, including High likelihood. Exact saturation threshold remains unmeasured.

### SR-009 — Direct database authority and weak audit identity defeat accountability

- Iteration disposition: Revised
- Severity: High
- Impact: High
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Privileged access / repudiation / insufficient logging
- CWE or equivalent: CWE-250, CWE-778
- Related threats: THR-014, THR-015, THR-017
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-004–AST-006, AST-009, AST-010
- Relevant actors: ACT-004, ACT-005, ACT-013
- Trust boundaries: TB-005, TB-007
- Affected components: database/CLI channels, audit fields, stub actor, RBAC

#### Claim

Database access bypasses RBAC and application audit. One credential spans runtime, migration, seed, and direct SQL; the stub system actor equals the real seeded admin; audit stamps are mutable latest-writer fields. SR-015 shows the shared role is superuser-equivalent under shipped defaults, while SR-017 shows the credential is printed.

#### Evidence

- `persistence/connection.py`, `schema/cli.py`, `seed/cli.py`, and auth DB dependency use the same connection path.
- `persistence/actor.py` and `seed/users.py:11-12` collide system/admin UUIDs; `schema/migrate.py:105-115` invokes the stub path.
- `mapping/system_fields.py` records only current create/update identity/time.
- No durable security audit, read/auth/permission events, tamper evidence, SIEM export, or separate roles exist.
- Writable API models exclude system fields, bounding direct stamp forgery to privileged/non-HTTP paths.

#### Preconditions and attack path

1. An operator, leaked log reader, host compromise, or API compromise obtains database authority.
2. Direct SQL changes data/RBAC/audit fields without application checks.
3. The actor erases or ambiguously attributes evidence to admin/automation.

#### Legitimate-user abuse case

An operator fixes a record in SQL, leaving misleading attribution.

#### Existing controls and disconfirming evidence

- Preventive: operator access is deliberately privileged; migrations are versioned; API write models forbid system fields.
- Detective: schema versions only.
- Recovery: customer backups, outside product scope.
- Disconfirming evidence: no least-privilege role split, database audit, distinct system identity, immutable event stream, or out-of-band detector.

#### Impact justification

The path permits broad confidentiality/integrity compromise while defeating investigation and non-repudiation.

#### Likelihood justification

Infrastructure authority is a meaningful prerequisite but routine for operators and a natural host-compromise pivot.

#### Minimal effective recommendation

Separate runtime, migration, seed, and human roles subject to SR-015's restore-point constraint; use a distinct system principal/channel; add durable exported security events and database-level privileged-change audit.

#### Verification approach

Test each role against representative reads, RBAC writes, DDL, restore points, and server programs; verify independently durable attribution.

#### Standards references

- OWASP ASVS V7; NIST SP 800-53 AU; CWE-778.

#### Disagreement or uncertainty

- AR-001 and AR-003 accepted. Role separation requires a product change or explicit restore-point privilege design.

### SR-010 — Anonymous callers receive the complete generated API schema

- Iteration disposition: Confirmed
- Severity: High
- Impact: Medium
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Security misconfiguration / information disclosure
- CWE or equivalent: CWE-200, CWE-16
- Related threats: THR-016
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-004, AST-005
- Relevant actors: ACT-001, ACT-011, ACT-012
- Trust boundaries: TB-004
- Affected components: FastAPI root/docs/OpenAPI and validation responses

#### Claim

Anonymous FastAPI defaults expose every route, model, field, legacy duplicate, demo probe, and service identifier despite intent permitting only minimal liveness. Validation responses return full Pydantic errors including echoed input.

#### Evidence

- `main.py:18-46` enables default `/docs`, `/redoc`, `/openapi.json`, `/`, and `/health`.
- `records/router_factory.py` places route/migration detail in OpenAPI.
- `request_validation.py:54-63` returns `jsonable_encoder(exc.errors())`, including input values.
- No production docs control or authentication wrapper exists.

#### Preconditions and attack path

1. The API is internet reachable.
2. A scanner requests OpenAPI/root and malformed inputs.
3. It receives a target map and combines it with default/auth findings.

#### Legitimate-user abuse case

None identified.

#### Existing controls and disconfirming evidence

- Preventive: actual operations retain Bearer/RBAC dependencies.
- Detective: ordinary server access logs may exist; no product event was found.
- Recovery: disable/authenticate docs and minimize validation output.
- Disconfirming evidence: no environment-aware route control exists.

#### Impact justification

This is reconnaissance, not direct compromise, but it precisely maps sensitive operational surfaces.

#### Likelihood justification

One anonymous request; commodity scanners probe defaults.

#### Minimal effective recommendation

Disable or authorize docs/OpenAPI/root outside development, retain only minimal liveness, and avoid echoing sensitive rejected input.

#### Verification approach

Assert production responses for root/docs/schema and malformed secret-bearing requests reveal only authorized/minimal data.

#### Standards references

- OWASP ASVS V14; OWASP A05; CWE-200.

#### Disagreement or uncertainty

- AR-011's demo-scaffolding concern is preserved separately as SR-019.

### SR-011 — Destructive schema escape hatches bypass the safe migration default

- Iteration disposition: Revised
- Severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Security category: Unsafe operational interface / data destruction
- CWE or equivalent: CWE-250, CWE-284
- Related threats: THR-020
- Related security requirements: None
- Prior acceptance or deferral: Class tiering is unimplemented intent
- Prior-decision reassessment: Conditions unchanged
- Affected assets: AST-004, AST-005, AST-007, AST-011
- Relevant actors: ACT-005, ACT-006, ACT-013
- Trust boundaries: TB-007, TB-009
- Affected components: migration wrappers and future promotion

#### Claim

The authoritative migration path refuses destructive changes by default, but importable compatibility/reset helpers default to destruction or drop tables. No current HTTP caller exists. Future tier enforcement is not analyzed by this finding and remains a gap under THR-027.

#### Evidence

- `schema/migrate.py:58-127` defaults safe, identifies destructive operations, and applies transactionally after a restore point.
- `schema/cli.py:38-60` requires `--allow-destructive`.
- `persistence/schema.py:18-73` defaults `apply_schema(... allow_destructive=True)` and exposes drop/recreate `sync_table`.
- No technical restriction makes helpers test-only.

#### Preconditions and attack path

1. Trusted code, tooling, or future promotion calls a permissive helper or overrides the gate.
2. Rename/drop/reset destroys data.
3. Recovery depends on customer backup/PITR; the restore point is only a WAL marker.

#### Legitimate-user abuse case

A developer imports the simpler compatibility helper without noticing its inverted default.

#### Existing controls and disconfirming evidence

- Preventive: authoritative migration/CLI fail closed; apply is transactional; operations are described.
- Detective: authoritative schema versions.
- Recovery: transaction rollback on failure; external backup for committed destruction.
- Disconfirming evidence: no HTTP caller keeps likelihood Low.

#### Impact justification

Committed destruction can remove operational data irreversibly from the product's perspective.

#### Likelihood justification

Requires trusted code/operator access; promotion is absent.

#### Minimal effective recommendation

Make all reusable APIs safe by default, isolate reset utilities, require typed destructive authorization with actor metadata, and implement tier enforcement before promotion.

#### Verification approach

Search callers and test every non-test entry refuses destructive plans before DDL.

#### Standards references

- OWASP ASVS V1/V14; CWE-250.

#### Disagreement or uncertainty

- AR-008 accepted: THR-027 is removed from this finding because no tier mechanism exists to analyze. Future promotion exploitability remains unknown.

### SR-012 — Dependency compromise reaches root-running application containers

- Iteration disposition: Revised
- Severity: High
- Impact: Critical
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Security category: Software supply chain / runtime containment
- CWE or equivalent: CWE-829, CWE-250
- Related threats: THR-021, THR-024
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001–AST-005, AST-008, AST-010, AST-011
- Relevant actors: ACT-012, ACT-014
- Trust boundaries: TB-010, TB-011
- Affected components: dependencies, images, runtime secrets

#### Claim

Dependencies are locked, but Python artifacts lack hashes and repository evidence shows no SBOM/advisory/provenance verification. Both final images run as root without containment, so compromised package code receives process secrets and unnecessary container privilege.

#### Evidence

- `backend/requirements.lock` pins versions without hashes; npm lock records integrity.
- Both Dockerfiles lack `USER`; Compose lacks read-only filesystem, capability drop, and no-new-privileges.
- No repository SBOM or dependency scan configuration was found.
- API holds JWT/database secrets; SSR holds its cookie secret and handles credentials/tokens, separately recorded in SR-018.

#### Preconditions and attack path

1. A poisoned selected artifact or compromised pinned artifact executes.
2. Code runs with application and root-container privilege.
3. It reads secrets/data and may use the superuser database path from SR-015.

#### Legitimate-user abuse case

None identified.

#### Existing controls and disconfirming evidence

- Preventive: exact versions; npm integrity; production pruning; multi-stage frontend.
- Detective: None in repository scope.
- Recovery: rebuild/upgrade and rotate secrets.
- Disconfirming evidence: vendor CI/CD is excluded and may add controls; no current-vulnerability claim is made.

#### Impact justification

Dependency code executes within trust boundaries holding platform-wide credentials.

#### Likelihood justification

Lockfiles remove silent version drift; compromise requires poisoned selection/artifact.

#### Minimal effective recommendation

Hash-pin Python, generate SBOMs, verify advisories/provenance, run dedicated non-root users, and minimize filesystem/capability/egress access.

#### Verification approach

Verify locked artifact hashes, SBOM/advisory coverage, image users/capabilities, and runtime write/secret boundaries.

#### Standards references

- OWASP ASVS V1/V14; SLSA concepts; CIS Docker 4.1; CWE-829/CWE-250.

#### Disagreement or uncertainty

- AR-008 accepted: THR-019 is removed because no customization sandbox was analyzed. No live advisory/provenance evidence was available.

### SR-013 — Stock self-hosted releases lack a vulnerability-notification capability

- Iteration disposition: Confirmed
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Vulnerability management / incident response
- CWE or equivalent: Operational control gap
- Related threats: THR-022
- Related security requirements: None
- Prior acceptance or deferral: ASM-009 is intent only
- Prior-decision reassessment: Conditions unchanged
- Affected assets: AST-001, AST-004, AST-005, AST-011
- Relevant actors: ACT-005, ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004, TB-011, TB-014
- Affected components: stock release/disclosure lifecycle

#### Claim

No `SECURITY.md`, disclosure route, support policy, advisory channel, or product update notification exists, leaving stock self-hosted customers without a defined report or notification path.

#### Evidence

- Repository inventory contains no `SECURITY.md` or equivalent policy/channel.
- ASM-003/ASM-009 make customers self-host and patch while advisory publication remains intent.

#### Preconditions and attack path

1. A released vulnerability becomes known.
2. Attackers identify exposed versions; customers receive no stock-product guidance.
3. Exposure persists through enterprise patch delay.

#### Legitimate-user abuse case

None identified.

#### Existing controls and disconfirming evidence

- Preventive: customers can update.
- Detective: None for deployed versions/notification.
- Recovery: customer-applied update.
- Disconfirming evidence: no supplied private process; accepted intent says capability is absent.

#### Impact justification

Impact follows the underlying defect across an internet-facing installed population.

#### Likelihood justification

Security defects and slow self-hosted patch cycles are expected over product lifetime.

#### Minimal effective recommendation

Publish disclosure/support/advisory policies and a customer notification/update mechanism before production release.

#### Verification approach

Tabletop a report, advisory, affected-version determination, and customer notification.

#### Standards references

- ISO/IEC 29147 and 30111 concepts; OWASP ASVS V14.

#### Disagreement or uncertainty

- None.

### SR-014 — Parallel legacy and v1 record surfaces create control-drift risk

- Iteration disposition: Revised
- Severity: Informational
- Impact: Medium
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Defense in depth / API lifecycle
- CWE or equivalent: CWE-693
- Related threats: THR-026
- Related security requirements: None
- Prior acceptance or deferral: Removal tracked by issue #117
- Prior-decision reassessment: Conditions changed; removal remains reasonable but lacks conditions
- Affected assets: AST-004, AST-005
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005
- Affected components: router factory, API mounting, FK projection

#### Claim

Both surfaces share current route authorization, so no authorization bypass is substantiated. They are not behaviorally identical: v1 enriches referenced records while legacy returns scalar IDs. Continued duplication creates future security-control drift and has no removal condition or parity test.

#### Evidence

- `records/router_factory.py:26-217` applies the same permission dependency but branches on `surface == "v1"` for enrichment.
- `main.py:30-34` mounts both.
- Deprecation references issue #117; no sunset condition, telemetry, or security parity test was found.
- SR-016 demonstrates current projection-content divergence.

#### Preconditions and attack path

1. A future row/field/reference control is added to one branch only.
2. Clients use the less restrictive surface.
3. The duplicate becomes an authorization/disclosure bypass.

#### Legitimate-user abuse case

A client remains on the older route because a new control makes v1 fail.

#### Existing controls and disconfirming evidence

- Preventive: shared factory and identical class-read dependency.
- Detective: OpenAPI deprecation only.
- Recovery: remove legacy under issue #117.
- Disconfirming evidence: current auth dependencies match; projection behavior already differs.

#### Impact justification

Future divergence could expose class data, but no present route-authorization bypass exists.

#### Likelihood justification

Shared construction keeps current authorization drift unlikely.

#### Minimal effective recommendation

Define migration/removal conditions and run identical security matrices across both surfaces while both remain.

#### Verification approach

Compare statuses, visibility, predicates, projection, enrichment, and future row/field rules across surfaces.

#### Standards references

- OWASP ASVS V4; project API compatibility cleanup convention.

#### Disagreement or uncertainty

- AR-002 accepted. The parity claim is narrowed to authorization dependencies, not response content.

### SR-015 — Runtime, seed, and migration share a superuser-equivalent database role

- Iteration disposition: New
- Severity: High
- Impact: Critical
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Excessive database privilege / host compromise
- CWE or equivalent: CWE-250
- Related threats: THR-002, THR-014, THR-020, THR-021
- Related security requirements: None
- Prior acceptance or deferral: Restore-point privilege documented operationally, not accepted as security risk
- Prior-decision reassessment: Rationale undocumented
- Affected assets: AST-001, AST-003–AST-006, AST-009–AST-011
- Relevant actors: ACT-005, ACT-012, ACT-013, ACT-014
- Trust boundaries: TB-006–TB-008, TB-011
- Affected components: connection helper, API, migrate, seed, Compose PostgreSQL

#### Claim

The API runtime, migration, and seed all use one database credential. Every non-empty migration unconditionally creates a restore point requiring superuser or equivalent privilege, and shipped Compose makes that same principal the PostgreSQL bootstrap superuser. SQL compromise therefore reaches database-server program execution/file access; runtime least privilege is absent.

#### Evidence

- `schema/versions.py:58-66` calls `pg_create_restore_point` and documents superuser/equivalent privilege and local Compose superuser status.
- `schema/migrate.py:100-103` invokes it unconditionally for non-empty plans.
- `persistence/connection.py:9-20`, `auth/dependencies.py`, `schema/cli.py:54`, and `seed/cli.py:27` share `connect()`.
- `compose.yaml:6-11` provisions `POSTGRES_USER=untangled`, the bootstrap superuser, and publishes the port.
- PostgreSQL restricts `COPY ... FROM PROGRAM` and server-file roles to superuser/equivalent privilege.

#### Preconditions and attack path

1. An attacker gets the default DB credential, reads it from SR-017 output, or compromises the API through SR-012.
2. The connection is the shipped bootstrap superuser.
3. The attacker runs server programs or reads server files as the database OS identity and pivots within the database container.

#### Legitimate-user abuse case

An operator uses the same convenient role for runtime and migration because the product's restore-point step otherwise fails.

#### Existing controls and disconfirming evidence

- Preventive: database reachability may be restricted by customer infrastructure; excluded and not assumed.
- Detective: None in product scope.
- Recovery: rotate credentials, rebuild database host, restore/investigate.
- Disconfirming evidence: a customer-created non-superuser runtime plus separate privileged migration role removes the path, but no product default/check/guidance enforces it.

#### Impact justification

Compromise crosses from application data into database-host command and file authority, potentially affecting every platform asset and availability.

#### Likelihood justification

Requires database/API-process compromise or a leaked operator secret, but shipped defaults actively provide the privileged role.

#### Minimal effective recommendation

Use separate least-privilege runtime, migration, seed, and human roles. Make restore-point creation optional or isolate its privilege so normal DDL migration does not force superuser-equivalent authority; forbid server-program/file roles for application identities.

#### Verification approach

Run runtime operations under a restricted role; migrate under a separately scoped role; assert runtime/seed cannot create restore points, execute server programs, read server files, or perform unrelated DDL.

#### Standards references

- OWASP ASVS V1/V14; PostgreSQL role and `COPY PROGRAM` documentation; CWE-250.

#### Disagreement or uncertainty

- AR-001 accepted. Customer production role design is unknown, but the shipped/default path and product privilege dependency are confirmed.

### SR-016 — FK identity enrichment discloses referenced-class content without permission

- Iteration disposition: New
- Severity: Medium
- Impact: Low
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Incorrect authorization / cross-class disclosure
- CWE or equivalent: CWE-863, CWE-200
- Related threats: THR-011, THR-012, THR-026
- Related security requirements: None
- Prior acceptance or deferral: ASM-024 identifiers are provisionally non-sensitive; FK inheritance was only a candidate
- Prior-decision reassessment: Conditions changed
- Affected assets: AST-001, AST-004, AST-005, AST-012
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Affected components: v1 fetch/search, FK enrichment, user display values

#### Claim

The v1 surface joins every projected FK—including `created_by` and `updated_by`—to the referenced table and returns display/friendly content without checking read permission on the referenced class. `incident:read` therefore yields user display names without `user:read`.

#### Evidence

- `fk_enrichment.py:56-72` adds projected FKs and audit references; lines 91-158 select target display/friendly columns and join target tables.
- `user.yaml:5,17-19` makes `display-name` the user display attribute.
- `records/router_factory.py:85-91,160-166` checks only the requested class.
- `seed/rbac_catalog.py:19-23,137-138` gives an incident-only role and defines no user permission.
- Enrichment returns display/friendly values only and cannot be used in predicates/sorts, bounding current impact.

#### Preconditions and attack path

1. Authenticate with only `incident:read`.
2. Search v1 incidents projecting `created_by`/`updated_by` and page by total.
3. Receive the referenced users' display names without user-class authorization or read audit.

#### Legitimate-user abuse case

An incident reader harvests the operator directory through normal “raised by” rendering.

#### Existing controls and disconfirming evidence

- Preventive: requested-class RBAC; target username/password hash are not selected; enriched values are projection-only.
- Detective: None identified.
- Recovery: revoke requested-class access; disclosed names cannot be recalled.
- Disconfirming evidence: current reachable target content is low sensitivity; future CMDB/integration references could raise impact.

#### Impact justification

Current stock exposure is user display names, not credentials, so impact is Low despite crossing a real authorization boundary.

#### Likelihood justification

Enrichment is unconditional on ordinary v1 reads and readily pageable.

#### Minimal effective recommendation

Define reference-visibility semantics consistent with ASM-025. Check referenced-class/attribute authority before enriching and return the same non-existence representation used for inaccessible content, rather than leaking a distinguishable display value.

#### Verification approach

Create a principal with source-class read only and assert fetch/search cannot distinguish or return target display/friendly content; repeat for all FK classes.

#### Standards references

- OWASP ASVS V4; OWASP A01; CWE-863.

#### Disagreement or uncertainty

- AR-002 accepted as a separate finding. Human design judgment remains needed for exact reference semantics.

### SR-017 — Operator CLIs print live database and seed credentials

- Iteration disposition: New
- Severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Sensitive information in logs
- CWE or equivalent: CWE-532
- Related threats: THR-002, THR-014, THR-017
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-003, AST-010
- Relevant actors: ACT-005, ACT-013
- Trust boundaries: TB-007, TB-008
- Affected components: migrate/seed CLI output

#### Claim

Both operator CLIs print raw `DATABASE_URL`, including its password. Seed also prints `password_for(seed)`, which is the effective environment-supplied production password when overridden, not merely the published default.

#### Evidence

- `schema/cli.py:49-54` prints `database_url()`.
- `seed/cli.py:24-39` prints `database_url()` and `password_for(seed)!r`.
- `seed/users.py:75-77` returns the environment override when present.
- `persistence/connection.py:13-15` returns the raw URL; no redactor or verbosity guard exists.

#### Preconditions and attack path

1. An operator correctly supplies production DB and seed secrets and runs migrate/seed.
2. Secrets enter terminal scrollback, CI logs, screen sharing, or copied diagnostics.
3. A broader log audience obtains database or admin authority, potentially composing with SR-015.

#### Legitimate-user abuse case

An operator pastes failed migration output into an incident or chat and discloses the database password.

#### Existing controls and disconfirming evidence

- Preventive: None.
- Detective: Secret-scanning outside repository scope may notice persisted logs.
- Recovery: rotate every printed credential and remove retained logs.
- Disconfirming evidence: output is unconditional and no redaction helper exists.

#### Impact justification

Exposure may grant high authority, but requires a second party with access to ephemeral/persisted operator output; Medium reflects the bounded disclosure channel.

#### Likelihood justification

Operator output is routinely retained or shared; the path occurs on every CLI invocation.

#### Minimal effective recommendation

Never print secret values. Redact URL credentials and report only which environment variable/source was used.

#### Verification approach

Run CLIs with canary secrets and assert no stdout/stderr substring contains passwords, tokens, or raw credential URLs.

#### Standards references

- OWASP ASVS V7/V14; CWE-532.

#### Disagreement or uncertainty

- AR-003 accepted. Iteration 1 incorrectly described the output as only an effective default.

### SR-018 — The SSR process concentrates all interactive credential material

- Iteration disposition: New
- Severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Credential concentration / blast radius
- CWE or equivalent: CWE-250, defense-in-depth architecture risk
- Related threats: THR-024, THR-028
- Related security requirements: None
- Prior acceptance or deferral: ADR 002 / THR-024 deliberate trade
- Prior-decision reassessment: Still supported, conditional on remaining visible and not hosting untrusted customization
- Affected assets: AST-001–AST-005, AST-008
- Relevant actors: ACT-007, ACT-012, ACT-014
- Trust boundaries: TB-001–TB-003, TB-010
- Affected components: SSR session, login, token forwarding, container

#### Claim

Code execution in the SSR process exposes the cookie signing secret, every access token in flight, and plaintext credentials during login, enabling session forgery and population-wide credential capture over time. The process runs as root. This is a verified blast-radius property requiring a prior compromise, not a claim that ADR 002's browser isolation choice is wrong.

#### Evidence

- `session.server.ts:20-47` stores the cookie signing secret and access token.
- `api.server.ts:65-80` attaches each Bearer token; lines 46-50 discard refresh tokens.
- `login.tsx:26-44` and `api.server.ts:26-37` handle plaintext login credentials.
- `frontend/Dockerfile:38-47` declares no non-root `USER`.
- THR-024 records the concentration as ADR 002's accepted cost; THR-028 makes it a standing input to customization-host choice.

#### Preconditions and attack path

1. An attacker gains SSR code execution or memory access, plausibly through SR-012.
2. The attacker reads the signing secret, forges sessions, observes tokens, and captures later logins.
3. If customer customization were hosted here, its author would begin inside this credential boundary.

#### Legitimate-user abuse case

None today. It becomes direct legitimate-author misuse if customer-authored code is placed in the web tier.

#### Existing controls and disconfirming evidence

- Preventive: tokens stay out of browser JavaScript; `.server.ts` separation; refresh token is discarded.
- Detective: None identified.
- Recovery: rotate session/JWT secrets and user credentials; rebuild process.
- Disconfirming evidence: requires prior SSR compromise; refresh discard limits persistence.

#### Impact justification

A resident attacker can impersonate the operator population and harvest future credentials.

#### Likelihood justification

Requires significant prior compromise; no untrusted customization runs today.

#### Minimal effective recommendation

Keep untrusted code out of the SSR process, run non-root, minimize process secrets and outbound access, add secret rotation and integrity monitoring, and make this concentration a hard input to THR-028.

#### Verification approach

Document/process-test secret inventory, runtime user, egress, rotation, and customization host constraints; assert no refresh persistence.

#### Standards references

- OWASP ASVS V1/V3; CIS Docker 4.1.

#### Disagreement or uncertainty

- AR-009 accepted. This preserves the accepted trade without reopening it.

### SR-019 — Demo schema, permissions, and RBAC probe ship in the production surface

- Iteration disposition: New
- Severity: Informational
- Impact: Low
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Deployment hygiene / least privilege
- CWE or equivalent: CWE-16
- Related threats: THR-016
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-006, AST-007
- Relevant actors: ACT-001, ACT-002, ACT-005
- Trust boundaries: TB-004, TB-009
- Affected components: class definitions, seed catalogue, `/auth/rbac-probe`, images

#### Claim

Demo class definitions, generated models, permissions attached to default roles, and `/auth/rbac-probe` ship without an environment gate. No present exploit is substantiated, but production attack surface and permission namespace contain development scaffolding.

#### Evidence

- `backend/class-definitions/demo-item.yaml` and `demo-link.yaml` are in the default definitions directory.
- Both Dockerfiles copy all definitions and generate models; `schema/migrate.py:72-81` loads every definition.
- `seed/rbac_catalog.py:19-23,118-131` creates demo-item permissions and grants them to default read roles.
- `auth/routes.py:39,89-94` mounts the demo permission probe unconditionally.

#### Preconditions and attack path

1. Production uses the shipped definitions and baseline seed.
2. Demo tables/permissions and probe become part of the deployed surface.
3. Anonymous OpenAPI reveals the scaffold, signaling retained development defaults and enlarging future control scope.

#### Legitimate-user abuse case

None identified; default users merely receive unnecessary demo authority.

#### Existing controls and disconfirming evidence

- Preventive: probe still requires permission; operator can choose another definitions directory.
- Detective: OpenAPI exposes the route.
- Recovery: remove demo definitions/permissions/route from production artifacts.
- Disconfirming evidence: no direct data or privilege escalation path was found, so this remains Informational.

#### Impact justification

Current effect is unnecessary schema/permissions and fingerprinting, not substantiated compromise.

#### Likelihood justification

Shipping is deterministic under defaults, but security impact depends on another weakness.

#### Minimal effective recommendation

Exclude demo definitions, generated models, seed grants, and probe routes from production artifacts through an explicit build/deployment profile.

#### Verification approach

Generate a clean production migration/OpenAPI/permission inventory and assert no demo-prefixed object or probe exists.

#### Standards references

- OWASP ASVS V14; OWASP A05.

#### Disagreement or uncertainty

- AR-011 accepted. Static loading establishes that a non-empty production migration plans demo tables; no database run was needed to substantiate artifact inclusion.

## 8. Iteration disposition ledger

### Sol iteration-1 findings

| Item | Source | Disposition | Sol conclusion | Evidence and justification |
| --- | --- | --- | --- | --- |
| SR-001 | Sol iteration 1 | Revised | Critical confirmed; required-claim gap added | AR-012 verified no required `exp`/`iat` |
| SR-002 | Sol iteration 1 | Revised | Critical confirmed; DB branch reaches host-level privilege | AR-001 and SR-015 verify shipped superuser role |
| SR-003 | Sol iteration 1 | Revised | High confirmed; body/password/pool mechanisms added | AR-004 accepted from synchronous routes and absent bounds |
| SR-004 | Sol iteration 1 | Revised | Medium confirmed; required expiry added to recommendation | AR-012 accepted |
| SR-005 | Sol iteration 1 | Revised | Severity raised Low to Medium | AR-007's authenticated loader path is cheaper and more likely |
| SR-006 | Sol iteration 1 | Revised | High retained; cache-control disconfirmation withdrawn; API tier added | AR-006 accepted; no document-response evidence |
| SR-007 | Sol iteration 1 | Confirmed | High whole-class extraction remains | Cross-class disclosure separated into SR-016 |
| SR-008 | Sol iteration 1 | Revised | High retained; likelihood raised to High | AR-005 multiplier, COUNT, offset, sort evidence accepted |
| SR-009 | Sol iteration 1 | Revised | High retained; superuser and CLI leakage composition added | AR-001/AR-003 accepted; separate SR-015/SR-017 |
| SR-010 | Sol iteration 1 | Confirmed | High anonymous schema exposure remains | Validation echo noted; demo surface separated |
| SR-011 | Sol iteration 1 | Revised | Medium helper risk remains; unsupported THR-027 link removed | AR-008 accepted |
| SR-012 | Sol iteration 1 | Revised | High supply-chain/container risk remains; unsupported THR-019 link removed | AR-008 accepted; concentration separated |
| SR-013 | Sol iteration 1 | Confirmed | High notification gap remains | Independent review found no contrary process |
| SR-014 | Sol iteration 1 | Revised | Informational drift risk remains; parity narrowed to authorization | AR-002 confirms current projection divergence |
| SR-015 | Sol iteration 2 | New | High superuser-equivalent role sharing | AR-001 substantiated |
| SR-016 | Sol iteration 2 | New | Medium cross-class FK disclosure | AR-002 substantiated |
| SR-017 | Sol iteration 2 | New | Medium operator secret output | AR-003 substantiated |
| SR-018 | Sol iteration 2 | New | Medium SSR credential concentration | AR-009 substantiated and prior trade preserved |
| SR-019 | Sol iteration 2 | New | Informational shipped demo scaffolding | AR-011 substantiated |

### Opus critique disposition

| Item | Source | Disposition | Sol conclusion | Evidence and justification |
| --- | --- | --- | --- | --- |
| AR-001 | Opus critique | Accepted | Added SR-015; revised SR-002/SR-009 | Restore point privilege and Compose bootstrap role verified |
| AR-002 | Opus critique | Accepted | Added SR-016; revised SR-014 | Unconditional joins and source-only permission check verified |
| AR-003 | Opus critique | Accepted | Added SR-017; corrected SR-002 | Raw effective secrets are printed |
| AR-004 | Opus critique | Accepted | Revised SR-003 | Unbounded fields and shared synchronous route pool verified statically |
| AR-005 | Opus critique | Accepted | Revised SR-008 likelihood/mechanism/recommendation | 50×50 leaves, duplicate predicate execution, unbounded offset/sort verified |
| AR-006 | Opus critique | Accepted | Revised SR-006; removed cache narrowing | Loader object is not document-level evidence; API has no policy |
| AR-007 | Opus critique | Accepted | Revised SR-005 to Medium and added loader path | One crafted link plus existing session suffices |
| AR-008 | Opus critique | Accepted | Removed THR-019/THR-027 finding links | No implemented sandbox or tier mechanism was analyzed |
| AR-009 | Opus critique | Accepted | Added SR-018 | Credential concentration is verified and must remain visible |
| AR-010 | Opus critique | Accepted | Corrected prior-acceptance accounting | No tolerance decision exists for SR-001–SR-013 |
| AR-011 | Opus critique | Accepted | Added SR-019 | Definitions, role grants, generated models, and probe ship |
| AR-012 | Opus critique | Accepted | Revised SR-001/SR-004 | Decoder has algorithm allowlist but empty required-claim set |

## 9. Threat coverage

| Threat ID | Relevant surface examined | Result | Finding IDs | Coverage limits |
| --- | --- | --- | --- | --- |
| THR-001 | JWT settings, signing, claims, admin identity | Finding | SR-001 | None |
| THR-002 | Seed, DB defaults, Compose role | Finding | SR-002, SR-015, SR-017 | Customer production roles unknown |
| THR-003 | Login and password verification | Finding | SR-003 | No live attack |
| THR-004 | Body, Argon2, DB connection, worker pool | Finding | SR-003 | No load test |
| THR-005 | User lookup timing | Finding | SR-003 | No network timing test |
| THR-006 | JWT claims, logout, live account checks | Finding | SR-001, SR-004 | None |
| THR-007 | Refresh rotation and SSR custody | Finding | SR-004 | Non-browser clients absent |
| THR-008 | Login CSRF, loader/action redirect | Finding | SR-005 | No remote target used |
| THR-009 | SSR/API headers and cache evidence | Finding | SR-006 | No built document capture |
| THR-010 | React and URL sinks | No issue substantiated |  | Rich text/custom rendering absent |
| THR-011 | Class RBAC and FK reference enrichment | Finding | SR-007, SR-016 | Future attribute design absent |
| THR-012 | Search extraction and volume | Finding | SR-007, SR-016 | No mature corpus |
| THR-013 | Predicate amplification, COUNT, offset, DB | Finding | SR-008 | No load test |
| THR-014 | CLI/direct DB authority and privilege | Finding | SR-009, SR-015, SR-017 | Customer DB controls excluded |
| THR-015 | Stub/admin collision | Finding | SR-009 | None |
| THR-016 | OpenAPI/root/validation/demo probe | Finding | SR-010, SR-019 | None |
| THR-017 | Audit fields/events/log leakage | Finding | SR-007, SR-009, SR-017 | No external SIEM evidence |
| THR-018 | Future configuration promotion | Insufficient evidence |  | Engine not implemented |
| THR-019 | Future customization runtime | Insufficient evidence |  | Sandbox/host not implemented |
| THR-020 | Migration gate/helpers/restore privilege | Finding | SR-011, SR-015 | Promotion absent |
| THR-021 | Dependencies, images, DB privilege composition | Finding | SR-012, SR-015 | No advisory/provenance scan |
| THR-022 | Disclosure/advisory capability | Finding | SR-013 | External private process not supplied |
| THR-023 | Cookie/internal transport and headers | Finding | SR-006 | Customer TLS excluded |
| THR-024 | SSR secret/token/credential custody | Finding | SR-012, SR-018 | Requires prior web compromise |
| THR-025 | Future account recovery | Insufficient evidence |  | Feature/channel absent |
| THR-026 | Legacy/v1 authorization and projection parity | Finding | SR-014, SR-016 | Future drift |
| THR-027 | Future class-tier enforcement | Insufficient evidence |  | Mechanism not designed/implemented |
| THR-028 | Future customization host identity | Insufficient evidence | SR-018 | Host/identity absent; SR-018 is decision input only |

`No issue substantiated` does not prove absence of vulnerability; it records the result of this scoped evidence review.

## 10. Diff-aware assessment

Not applicable — full-review mode.

### Changed security-relevant surfaces

- Not applicable.

### Introduced risks

- Not applicable.

### Regressions

- Not applicable.

### Exposure changes

- Not applicable.

### Relevant pre-existing risks

- Full-review provenance is not classified. All nineteen findings exist at the pinned commit.

### Provenance uncertainty

- Not applicable.

## 11. Prior accepted-risk reassessment

TM-REV-001 explicitly accepts no individual risk. Accepting the threat model accepted its description, not tolerance of its threats. Therefore SR-001–SR-013, SR-015–SR-017, and SR-019 have no prior tolerance decision to reassess.

| Finding ID | Prior decision or rationale | Current evidence and security practice | Reassessment | Human review needed |
| --- | --- | --- | --- | --- |
| SR-014 | Legacy removal tracked by issue #117; shared factory limits current auth drift | Auth dependency parity holds; v1 projection differs through enrichment; removal conditions absent | Conditions changed | Yes |
| SR-015 | Restore-point privilege documented as operational caveat | It structurally pressures deployments toward a privileged migration role and shipped runtime shares it | Rationale undocumented | Yes |
| SR-016 | ASM-024 treats identifiers as provisionally non-sensitive and FK inheritance as optional future refinement | Current v1 returns referenced content, not just identifier | Conditions changed | Yes |
| SR-018 | ADR 002 / THR-024 deliberately accepts SSR concentration while keeping it visible | Concentration and refresh discard are both verified; web tier must not host untrusted code | Still supported | Yes |

AR-010 is accepted: the iteration-1 row asserting an undocumented tolerance rationale for SR-001–SR-013 was erroneous and is not repeated.

## 12. Attack chains and abuse cases

| Chain or abuse case | Component findings or threats | Combined path | Resulting risk |
| --- | --- | --- | --- |
| Silent-default host takeover | SR-010 → SR-002 → SR-015 | Anonymous schema maps routes; default DB credential reaches bootstrap superuser | Database-container command/file compromise |
| Forged durable administrator | SR-001 → SR-007 → SR-009 | Public key mints no-expiry admin token; corpus is drained; reads are unlogged | Complete, hard-to-scope compromise |
| Log-to-database compromise | SR-017 → SR-015 → SR-009 | CLI exposes DB credential to logs; role is privileged; direct SQL rewrites data/audit | Integrity loss and repudiation |
| Undetected corpus/directory extraction | SR-003 → SR-007/SR-016 → SR-009 | Stuffed credential reads whole classes and referenced identities without read trail | Broad confidential-data loss |
| Availability collapse | SR-003 + SR-008 | Anonymous shared-pool Argon2 work and amplified database predicates hit separate chokepoints | Loss of incident-management capability |
| Session capture and persistence | SR-006 → SR-004 | Insecure transport captures token; logout cannot terminate it | Guaranteed foothold until revocation condition |
| Supply-chain privileged pivot | SR-012 → SR-015/SR-018 | Package code runs as root, reads process secrets, uses privileged DB or SSR credentials | Platform-wide compromise |
| Trusted-domain phishing | SR-005 | Existing session plus crafted genuine-domain link redirects to attacker origin | Credential phishing and operator misdirection |
| Shipped-development signal | SR-010 + SR-019 → SR-001/SR-002 | OpenAPI shows demo probe/scaffold, increasing confidence other development defaults remain | More efficient default exploitation |

## 13. Disagreements

All twelve material iteration-1 Opus critiques were accepted in full or incorporated without changing the supported core finding. No unresolved Sol/Opus disagreement remains. The following evidentiary and design questions are preserved rather than presented as consensus about unknown facts.

| Related item | Sol position | Opus position | Evidence for each | Resolution status |
| --- | --- | --- | --- | --- |
| SR-006 document cache header | Loader requests no-store, but document propagation is unverified and cannot narrow THR-009 | Iteration-1 narrowing unsupported absent document response evidence | Same loader/test; no `headers` export; no built capture | Sol revised |
| SR-005 severity | Medium; redirect half drives rating | Medium; one-click loader path has Medium likelihood | `login.tsx:16-24`, `next_path.ts`, WHATWG behavior | Sol revised |
| SR-008 likelihood | High after quantified amplification | High due 50×50 leaves, duplicate COUNT, unbounded offset | `search.py` constants/control flow | Sol revised |
| SR-002/SR-009 blast radius | Shipped DB branch reaches server-program/file authority | Same | Restore-point docs/code, Compose bootstrap role | Sol revised |
| SR-009 role split | Required, but restore-point design must change or isolate privilege | Direction sound but currently blocked | `migrate.py:100-103`, `versions.py:58-66` | Sol revised |
| SR-007 reference scope | Source-class extraction remains; cross-class issue gets SR-016 | Cross-class content needed explicit treatment | `fk_enrichment.py`, source-only RBAC | Sol revised |
| THR-019/THR-027 accounting | Both are coverage gaps, not finding links | Same | No implementation exists | Sol revised |
| Prior tolerance accounting | No prior tolerance for SR-001–SR-013 | Same | TM-REV-001 section 15 | Sol revised |

## 14. Unknowns and coverage gaps

| Related item | Unknown or gap | Why it matters | Evidence needed |
| --- | --- | --- | --- |
| SR-003 | Body/parser and Argon2 saturation under deployed concurrency | Sets numeric bounds and operational likelihood | Representative concurrent load and memory/thread telemetry |
| SR-006 | SSR document header propagation and customer TLS/service transport | Determines cache/credential exposure | Built raw response capture and production topology |
| SR-008 | Predicate/regex/offset saturation threshold | Sets safe caps and timeout | Representative large corpus with DB telemetry |
| SR-012 | Current advisories and artifact provenance | Could reveal a presently vulnerable package or external controls | Authorized SCA/SBOM/provenance scan |
| SR-015 | Intended production DB role split and restore-point policy | Determines whether customers can avoid superuser-equivalent runtime | Deployment guidance and product decision |
| THR-018 | Configuration promotion and provenance | Governs production authority outside RBAC | Accepted design and implementation |
| THR-019, THR-028 | Sandbox, host, identity, resource and egress policy | Determines untrusted-code blast radius | Accepted design and implementation |
| THR-025 | Recovery token/delivery/session invalidation | Recovery can become direct takeover | Accepted flow and tests |
| THR-027 | Tier identity, normalization, enforcement layers, additive-only meaning | Carries impact reduction on configuration threats | Design and implementation under issue #116 |
| SSO, event bus, integrations, CMDB | No implemented trust paths | May introduce identities, brokers, outbound credentials, sensitive references | Re-review when each design/implementation exists |

## 15. Withdrawn or unsubstantiated candidates

| Candidate | Why it was considered | Disconfirming evidence | Final disposition |
| --- | --- | --- | --- |
| Present stored XSS | Free-text records render in SSR | React escaping; no dangerous HTML/URL sink found | Not substantiated; re-review with rich text/custom rendering |
| SQL injection in search | Client controls operators, names, values | Definitions validate names; `sql.Identifier` and placeholders used | Withdrawn |
| SSRF through absolute fetch helper | Helper accepts absolute strings and attaches Bearer | Reviewed production caller allowlists collection before construction | Not presently reachable; defense-in-depth cleanup remains useful |
| Current legacy/v1 authorization bypass | Two data surfaces exist | Shared factory applies same class permission | Not substantiated; SR-014 informational, SR-016 covers projection disclosure |
| Authenticated cache control confirmed | Loader sets no-store | No document `headers` export or raw response evidence | Withdrawn as a disconfirmation; retained as SR-006 uncertainty |
| Standalone JWT required-claim finding | Missing claims permit no-expiry forged token | Requires signing capability already supplied by SR-001 | Incorporated into SR-001/SR-004, not separate |
| Separate login body/pool finding | AR-004 identified additional mechanisms | Same reachable login exhaustion path and same controls as SR-003 | Incorporated into SR-003 |
| Separate search amplification finding | AR-005 identified multiplier/COUNT/offset | Same authorized search exhaustion path and controls as SR-008 | Incorporated into SR-008 |
| Current customization, tier, promotion, or recovery exploit | Accepted threats are forward-looking | No runtime, host, promotion engine, tier enforcement, or recovery channel exists | Coverage gaps, not findings |

## 16. Completion

Finding counts:

- Critical: 2
- High: 9
- Medium: 6
- Low: 0
- Informational: 2
- Disputed: 0
- Uncertain: 5

`Uncertain` counts finding records with material implementation, runtime, environment, or external-evidence uncertainty: SR-003, SR-006, SR-008, SR-011, and SR-012. Design-stage gaps remain separately visible and are not counted as findings.

Completion checks:

- [x] Inputs match the run manifest.
- [x] Accepted intent and prior artefacts match their pinned hashes; diff is not applicable.
- [x] Every finding has evidence and justified ratings.
- [x] Every finding links to applicable threat IDs.
- [x] Diff provenance is not applicable in full-review mode.
- [x] Every identified pre-existing weakness remains visible.
- [x] Every identified prior decision has a current reassessment; no nonexistent tolerance is inferred.
- [x] Iteration 2 accounts for all fourteen prior findings and all twelve material Opus critiques.
- [x] Disagreements and uncertainty are preserved.
- [x] Summary tables match the nineteen authoritative detailed records.
