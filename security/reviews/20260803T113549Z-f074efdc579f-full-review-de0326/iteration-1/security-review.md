# Security Review — Sol Analysis

Status: Complete
Run ID: 20260803T113549Z-f074efdc579f-full-review-de0326
Iteration: 1
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
| Iteration 1 security review | Not applicable |
| Iteration 1 security-review SHA-256 | Not applicable |
| Iteration 1 adversarial review | Not applicable |
| Iteration 1 adversarial-review SHA-256 | Not applicable |

## 2. Scope

### In scope

- Full accepted TM-REV-001 scope: the single-tenant, customer-hosted, internet-facing platform; implemented Milestone 1 API, SSR web tier, PostgreSQL persistence, authentication, class-wide RBAC, record APIs, predicate search, migration and seed CLIs, dependency inputs, and deployment defaults.
- Forward-looking configuration promotion, class tiers, SSO, recovery, administration, non-browser clients, customization runtime, event bus, integrations, discovery, and CMDB to the extent modelled by accepted intent.
- Stock implementation at the pinned repository commit.

### Explicit exclusions

- Physical and data-centre security; customer host, network, load-balancer, Kubernetes, and backup hardening.
- Vendor and customer configuration CI/CD; customer forks; multi-tenant shared-database isolation.
- No additional exclusions.

### Components and attack surfaces examined

- `backend/src/untangled/auth/**`, `rbac/**`, `records/**`, `persistence/**`, `schema/**`, `seed/**`, `main.py`, class definitions, and relevant backend tests.
- `frontend/app/auth/**`, authenticated/login/logout routes, record server seams, SSR root, navigation validation, and relevant frontend tests.
- `compose.yaml`, both Dockerfiles, Python and npm dependency manifests and lockfiles.
- Accepted assets AST-001–AST-012, actors ACT-001–ACT-015, boundaries TB-001–TB-014, assumptions ASM-001–ASM-026, and threats THR-001–THR-028.

### Scope limitations

- Static review only. No destructive tests, load tests, live deployment inspection, production secrets, third-party targeting, or runnable exploit was used.
- The redirect-normalization issue in SR-005 was safely confirmed with the local WHATWG URL implementation; no HTTP target was contacted.
- Dependency versions were examined for pinning and integrity controls, but no live vulnerability-database scan or package provenance verification was performed.
- Forward-looking surfaces have no implementation to trace; conclusions about them are coverage gaps or low-confidence control dependencies, not claims about executable code.
- Customer infrastructure controls could materially reduce several likelihoods but are explicitly out of scope and were not assumed.

## 3. Executive summary

### Overall assessment

The pinned Milestone 1 implementation has two independently exploitable Critical paths when development defaults reach an internet-facing deployment: a published JWT signing secret silently accepted by the API, and published administrative/database credentials accepted by production-capable seed and connection paths. Either can bypass ordinary credential theft and lead to complete platform compromise.

The implementation also confirms broad High-risk exposure around unauthenticated authentication abuse, class-wide data access and bulk extraction, database query exhaustion, privileged out-of-band database operations, incomplete auditability, anonymous API discovery, transport/browser hardening, dependency compromise, and the absence of a stock-release disclosure process. Existing controls are meaningful—parameterized SQL, Argon2id, per-request account and permission resolution, atomic refresh rotation, `httpOnly` cookies, a safe-by-default `Secure` flag, React escaping, bounded predicate structure, transactional migration, and lockfiles—but do not close those attack paths.

The review also found one control bypass not stated explicitly in TM-REV-001: `safe_next_path` accepts backslash-based network-path references that browser URL normalization resolves to another origin. It does not disclose the `httpOnly` token by itself, but it weakens login-flow integrity and phishing resistance.

### Highest-severity findings

- SR-001: a published HS256 secret fallback permits arbitrary access-token forgery and administrative impersonation.
- SR-002: the seed and database paths accept published defaults without a production guard.
- SR-003, SR-007, SR-008 and SR-009: low-cost authentication abuse, class-wide extraction, query exhaustion, and inadequate audit/privileged-path accountability compose into high-impact, hard-to-investigate incidents.

### Newly introduced or changed exposure

Not applicable — this is a full review of a pinned snapshot, not a diff-aware assessment.

### Pre-existing weaknesses requiring attention

- All detailed findings are present in the reviewed snapshot; full-review mode does not assign change provenance.
- No individual risk was accepted in TM-REV-001. Acceptance of the threat model was acceptance of its description, not tolerance of the risks.
- The authenticated layout does set `Cache-Control: private, no-store` (`frontend/app/routes/authenticated.tsx:36-39`), so the broader header finding does not repeat the threat model's earlier claim that no authenticated cache control exists. The remaining absence of CSP, HSTS, framing, MIME-sniffing controls, and deployment enforcement is independently substantiated.

### Material uncertainty

- Actual Argon2 and regexp exhaustion thresholds require representative load testing.
- Transport likelihood depends on customer TLS and internal-network configuration, which is out of scope.
- Configuration tiering, customization isolation, account recovery, SSO, and service identities are not implemented; accepted intent states useful constraints but does not yet provide an evaluable control design.
- No live dependency advisory/provenance scan was performed.

## 4. Analysis method

### Threat-model coverage

The review used each accepted asset, actor, boundary, assumption, and threat as a hypothesis, then followed the corresponding code and configuration path at the pinned commit. It sought disconfirming controls in shared dependencies, route factories, tests, deployment defaults, and SSR seams. Ratings use TM-REV-001's production internet-facing calibration and matrix. Forward-looking threats were retained as unknowns where no implemented surface supports an exploit.

### Implementation evidence examined

| Evidence | Revision or location | Purpose |
| --- | --- | --- |
| Accepted threat model | Pinned Git object at target commit; hash verified | Governing scope, threats, boundaries, assumptions, and rating matrix |
| Authentication and RBAC | `backend/src/untangled/auth/**`, `rbac/**`, related tests | Token, password, session, account, and permission controls |
| Records and search | `records/router_factory.py`, `persistence/search.py`, tests | Object access, projection, pagination, SQL compilation, and resource limits |
| SSR web tier | `frontend/app/auth/**`, routes and record server seams | Cookie custody, redirects, login/logout, cache controls, and Bearer forwarding |
| Operator and schema paths | `schema/**`, `seed/**`, `persistence/connection.py` | Direct database authority, destructive changes, defaults, and attribution |
| Deployment and dependencies | Compose, Dockerfiles, manifests and lockfiles | Secrets, transport assumptions, runtime privilege, and supply-chain controls |

### Standards used

| Standard | Specific section or control | Application |
| --- | --- | --- |
| OWASP ASVS 5.0 | V2 Authentication, V3 Session Management, V4 Access Control, V7 Logging, V12 Communication | Authentication abuse, token lifecycle, authorization, audit, and transport |
| OWASP Top 10:2021 | A01, A02, A05, A07, A09 | Access control, cryptographic defaults, misconfiguration, authentication, and logging |
| NIST SP 800-63B | Verifier throttling and session management | Login rate limiting and session termination |
| RFC 8725 | JWT Best Current Practices | Algorithm constraints, key strength, and validation |
| RFC 9700 | OAuth 2.0 Security BCP, refresh token protection | Rotation, replay detection, and token families |
| CWE | CWE-798, 307, 208, 601, 862, 770, 778, 16, 1392 | Finding classification |

## 5. Rating method

The accepted threat model's impact, likelihood, and overall-priority rubric was used. Finding severity equals the matrix result; no finding was elevated outside the matrix. `Informational` denotes a useful hardening or future-drift observation without a present substantiated exploit path. Confidence reflects evidence quality, not impact.

## 6. Finding summary

| Severity | ID | Finding | Provenance | Confidence | Related threats |
| --- | --- | --- | --- | --- | --- |
| Critical | SR-001 | Published signing-secret fallback permits arbitrary administrative JWTs | Not applicable | High | THR-001 |
| Critical | SR-002 | Production-capable seed and database paths accept published credentials | Not applicable | High | THR-002 |
| High | SR-003 | Login has no abuse controls and exposes asymmetric Argon2 work | Not applicable | High | THR-003, THR-004, THR-005 |
| Medium | SR-004 | Session termination and refresh replay response are incomplete | Not applicable | High | THR-006, THR-007 |
| Low | SR-005 | Login integrity lacks CSRF protection and redirect validation is bypassable | Not applicable | High | THR-008 |
| High | SR-006 | Browser and transport hardening depends on unenforced deployment choices | Not applicable | Medium | THR-009, THR-023 |
| High | SR-007 | One class-read grant enables reliable, unrecorded whole-class extraction | Not applicable | High | THR-011, THR-012, THR-017 |
| High | SR-008 | Authenticated pattern search can exhaust the shared database | Not applicable | High | THR-013 |
| High | SR-009 | Direct database authority and weak audit identity defeat accountability | Not applicable | High | THR-014, THR-015, THR-017 |
| High | SR-010 | Anonymous callers receive the complete generated API schema | Not applicable | High | THR-016 |
| Medium | SR-011 | Destructive schema escape hatches bypass the safe migration default | Not applicable | Medium | THR-020, THR-027 |
| High | SR-012 | Dependency compromise reaches root-running application containers | Not applicable | Medium | THR-019, THR-021, THR-024 |
| High | SR-013 | Stock self-hosted releases lack a vulnerability-notification capability | Not applicable | High | THR-022 |
| Informational | SR-014 | Parallel legacy and v1 record surfaces create future control-drift risk | Not applicable | High | THR-026 |

This table is derived from the detailed finding records, which are authoritative.

## 7. Detailed findings

### SR-001 — Published signing-secret fallback permits arbitrary administrative JWTs

- Iteration disposition: New
- Severity: Critical
- Impact: Critical
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Cryptographic failure / security misconfiguration / authentication bypass
- CWE or equivalent: CWE-798, CWE-321
- Related threats: THR-001
- Related security requirements: None
- Prior acceptance or deferral: None; ASM-007 states the opposite fail-closed intent
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001–AST-006, AST-010
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-004, TB-005, TB-008
- Affected components: API JWT settings, token decoder, seed identity, RBAC

#### Claim

If `UNTANGLED_JWT_SECRET` is absent or retains the Compose value, any internet attacker who knows the repository can mint a valid HS256 access token for the fixed seeded administrator UUID and receive current database-backed administrator permissions.

#### Evidence

- `backend/src/untangled/auth/settings.py:15-20` silently returns the published literal fallback.
- `backend/src/untangled/auth/tokens.py:20-50` signs and verifies HS256 using that value and requires only `sub`, `typ`, and valid timing claims.
- `backend/src/untangled/seed/users.py:11-13` publishes the administrator UUID.
- `backend/src/untangled/auth/dependencies.py:43-51` accepts the forged subject when the seeded account is active; `rbac/dependencies.py:32-51` then resolves its live permissions.
- `compose.yaml:25-30` actively supplies the same known secret.

#### Preconditions and attack path

1. A deployment starts with the missing or copied development secret and has an active seeded administrator.
2. The attacker creates an HS256 token with `sub` equal to the fixed admin UUID and `typ=access`.
3. The API verifies it with the same published secret, loads the admin row, and authorizes all operations.

#### Legitimate-user abuse case

Any repository reader can verify whether an exposed deployment retained the default without an internal account.

#### Existing controls and disconfirming evidence

- Preventive: algorithm allowlist; expiry; active-user and live-permission checks.
- Detective: None identified.
- Recovery: changing the secret invalidates all access JWTs, but no rotation mechanism exists.
- Evidence sought that could disprove or reduce the finding: no API startup assertion, known-default rejection, environment mode, key identifier, or asymmetric verifier was found. The web tier fails closed on its distinct cookie secret, which does not protect direct API access.

#### Impact justification

The path grants unrestricted platform and record authority and can be repeated indefinitely while the default remains. Recovery requires secret replacement and investigation without a sufficient audit trail.

#### Likelihood justification

The default and administrator subject are public, failure is silent, and the exploit requires one signed request. Operational omission is a realistic production precondition.

#### Minimal effective recommendation

Require an explicit JWT secret at startup, reject known development values outside an explicit local-development mode, and enforce minimum entropy. Separate issuance and verification keys when the planned signing redesign occurs.

#### Verification approach

Start the API with the variable missing and with the known value under production configuration; both must fail before listening. Verify a token signed with the repository value is rejected.

#### Standards references

- OWASP ASVS V2; OWASP A02/A05; RFC 8725.

#### Disagreement or uncertainty

- None.

### SR-002 — Production-capable seed and database paths accept published credentials

- Iteration disposition: New
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
- Affected assets: AST-001, AST-004–AST-006, AST-010
- Relevant actors: ACT-005, ACT-011, ACT-012
- Trust boundaries: TB-004, TB-006, TB-007, TB-008
- Affected components: Seed CLI, user catalog, database connection, Compose

#### Claim

The stock operator paths can create a fixed allow-all administrator with a published password and connect with published database credentials without distinguishing development from production.

#### Evidence

- `backend/src/untangled/seed/users.py:31-77` defines fixed usernames, UUIDs, and default passwords; admin uses `admin-change-me`.
- `backend/src/untangled/seed/cli.py:24-39` seeds without a production guard and prints the effective plaintext default.
- `backend/src/untangled/persistence/connection.py:9-20` silently defaults to `untangled:untangled`.
- `compose.yaml:4-11,22-32` uses those credentials and publishes PostgreSQL and API ports.
- `backend/src/untangled/seed/rbac_catalog.py:118-125,168-173` assigns the admin allow-all permission.

#### Preconditions and attack path

1. An operator seeds with omitted overrides, or deploys the default database URL and exposes the corresponding port.
2. An attacker logs in with the published administrator password or connects directly to PostgreSQL.
3. The attacker obtains complete application or database authority.

#### Legitimate-user abuse case

An operator performs the documented seed step to make a deployment usable and intends to rotate credentials later; no control forces that intention to complete.

#### Existing controls and disconfirming evidence

- Preventive: conspicuous `-change-me` names; environment overrides; seed is deliberate, not automatic.
- Detective: seed output exposes which source was used, but no durable security event is recorded.
- Recovery: manual password/database credential replacement.
- Evidence sought that could disprove or reduce the finding: no environment classification, first-login change, known-default detection, or production refusal exists.

#### Impact justification

Both paths yield total compromise, with the database route bypassing all application authorization and audit controls.

#### Likelihood justification

Defaults are public and operator omission is common; exploitation needs no technical bypass.

#### Minimal effective recommendation

Fail closed on missing database and seed secrets outside an explicit local fixture; refuse known defaults, generate unique bootstrap credentials, and require a controlled first-use rotation.

#### Verification approach

Run production-mode startup and seed with every relevant variable absent or equal to a known default; each path must fail without changing the database.

#### Standards references

- OWASP ASVS V2/V12; OWASP A05; CWE-1392.

#### Disagreement or uncertainty

- None.

### SR-003 — Login has no abuse controls and exposes asymmetric Argon2 work

- Iteration disposition: New
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Authentication abuse / denial of service / observable discrepancy
- CWE or equivalent: CWE-307, CWE-208, CWE-770
- Related threats: THR-003, THR-004, THR-005
- Related security requirements: None
- Prior acceptance or deferral: None; issue #33 is referenced by accepted intent
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-002, AST-011
- Relevant actors: ACT-001, ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004, TB-006
- Affected components: `/auth/login`, password verification, request database connection

#### Claim

Anonymous callers can make unlimited login attempts. Known active usernames trigger expensive Argon2 verification while unknown or inactive usernames return before hashing, enabling credential attacks, coarse username timing enumeration, and CPU/memory exhaustion.

#### Evidence

- `backend/src/untangled/auth/routes.py:42-52` has no throttle or abuse dependency.
- `backend/src/untangled/auth/passwords.py:5-21` uses Argon2 `PasswordHasher()` defaults.
- `backend/src/untangled/auth/store.py:55-62` returns before password verification for unknown/inactive users.
- `backend/src/untangled/auth/dependencies.py:21-27` creates one database connection per request.
- Repository search found no rate limiter, lockout, authentication-event log, or concurrency budget.

#### Preconditions and attack path

1. The internet-facing login endpoint is reachable.
2. An attacker submits credential lists or concurrent attempts for a known seeded or enumerated username.
3. Guesses proceed without throttling while each request consumes Argon2 and database resources; valid and invalid usernames have materially different work.

#### Legitimate-user abuse case

An insider can grind another user's password through the normal endpoint without creating a security event.

#### Existing controls and disconfirming evidence

- Preventive: Argon2id increases per-guess cost; generic response body; inactive accounts fail.
- Detective: None identified.
- Recovery: process/orchestrator restart only; customer infrastructure controls were not assumed.
- Evidence sought that could disprove or reduce the finding: no dummy hash, rate limit, lockout, MFA, source/account budget, or authentication logging was found.

#### Impact justification

Account compromise inherits broad class access, while resource exhaustion disrupts the incident-management service. Username enumeration is lower impact but directly improves the other paths.

#### Likelihood justification

Credential stuffing is routinely automated against internet login surfaces and requires no prior account. Actual resource saturation depends on capacity, but unlimited work is structurally exposed.

#### Minimal effective recommendation

Add product-level, failure-safe per-account and per-source throttling with global concurrency shedding; perform a fixed dummy verification for unknown/inactive accounts; emit privacy-conscious authentication security events.

#### Verification approach

Use a local representative load fixture to compare known/unknown timings, verify bounded concurrent Argon2 work, and assert stable 429/backoff behavior without account-lockout denial of service.

#### Standards references

- NIST SP 800-63B verifier throttling; OWASP ASVS V2; CWE-307/CWE-208.

#### Disagreement or uncertainty

- Saturation thresholds were not measured; this affects capacity planning, not the presence of the unbounded work path.

### SR-004 — Session termination and refresh replay response are incomplete

- Iteration disposition: New
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
- Prior acceptance or deferral: None; token revocation is deferred in accepted intent
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-002
- Relevant actors: ACT-009, ACT-011, ACT-013
- Trust boundaries: TB-002, TB-003, TB-004
- Affected components: access JWTs, refresh-token store, SSR login/logout

#### Claim

Logout cannot terminate an access JWT; access TTL has no upper bound; refresh rotation detects only current validity, not family replay; and the SSR tier discards the issued refresh token then destroys only its cookie on logout, leaving an active, unusable refresh row until expiry.

#### Evidence

- `backend/src/untangled/auth/tokens.py:23-50` emits no `jti` or token generation.
- `backend/src/untangled/auth/settings.py:23-30` accepts unbounded operator TTLs.
- `backend/src/untangled/auth/store.py:74-87,138-160` atomically rotates but records no family or reuse event.
- `backend/src/untangled/auth/routes.py:68-71` revokes only a supplied refresh token.
- `frontend/app/auth/api.server.ts:22-50` discards refresh tokens; `frontend/app/routes/logout.tsx:6-10` only destroys the browser session.
- Per-request active-user and RBAC resolution in `auth/dependencies.py:48-51` and `rbac/dependencies.py:21-26` materially bounds stale authority.

#### Preconditions and attack path

1. An attacker obtains an access or future non-browser refresh token.
2. Logout does not invalidate the access token; refresh replay either steals the live rotation position or fails without triggering family invalidation.
3. The attacker continues until expiry or keeps the refresh chain alive.

#### Legitimate-user abuse case

A departing user continues using a captured token during its remaining lifetime.

#### Existing controls and disconfirming evidence

- Preventive: short default access TTL; opaque high-entropy refresh values; digest-only storage; atomic single-use rotation; active-user and permissions rechecked per request.
- Detective: None identified for replay.
- Recovery: account deactivation immediately blocks requests.
- Evidence sought that could disprove or reduce the finding: no denylist, user generation, family lineage, reuse event, TTL ceiling, or sign-out-everywhere operation was found.

#### Impact justification

Compromise is bounded by token lifetime and prompt account/permission checks, so it is not equivalent to permanent stale authority.

#### Likelihood justification

Token capture requires another foothold; refresh exposure is currently limited because the SSR tier discards it.

#### Minimal effective recommendation

Bound configurable TTLs; add deliberate access-session revocation; track refresh families and invalidate the family on replay. Align SSR login/logout so no live refresh credential is issued when it cannot be retained and revoked.

#### Verification approach

Issue, rotate, replay, logout, deactivate, and revoke sessions in tests; assert every termination path denies both token types and emits a security event.

#### Standards references

- RFC 9700 refresh-token replay protection; NIST SP 800-63B session management; OWASP ASVS V3.

#### Disagreement or uncertainty

- The final JWT-versus-opaque-session design is intentionally open; the finding is control-oriented and does not require either answer.

### SR-005 — Login integrity lacks CSRF protection and redirect validation is bypassable

- Iteration disposition: New
- Severity: Low
- Impact: Medium
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Login CSRF / open redirect
- CWE or equivalent: CWE-352, CWE-601
- Related threats: THR-008
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-002, AST-004, AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-002
- Affected components: SSR login action and `safe_next_path`

#### Claim

The unauthenticated login POST has no CSRF/origin control, allowing forced login to an attacker-controlled account. Separately, `safe_next_path` rejects `//host` but accepts `/\host`; WHATWG URL normalization turns that accepted value into `https://host/`, enabling a post-login external redirect.

#### Evidence

- `frontend/app/routes/login.tsx:26-54,74-115` accepts credentials and commits a session without a CSRF token or Origin/Referer validation.
- `frontend/app/auth/next_path.ts:5-15` checks leading forward slashes and `://` only.
- `frontend/app/auth/auth.test.ts:8-21` tests absolute and protocol-relative URLs but has no backslash case.
- Safe local confirmation: resolving `/\evil.example/path` against `https://untangled.example/login` produced `https://evil.example/path`.
- The session cookie is `httpOnly`, host-scoped, and `sameSite=lax` (`session.server.ts:36-45`), which prevents direct token disclosure and limits authenticated cross-site actions.

#### Preconditions and attack path

1. The victim visits an attacker page able to submit the login form with attacker credentials, or follows a crafted login URL carrying an encoded backslash `next`.
2. The application creates the attacker's session in the victim's browser and/or redirects the newly authenticated victim to an attacker origin.
3. The attacker uses account confusion to induce data entry or phishing; the cookie itself is not sent to the external host.

#### Legitimate-user abuse case

None identified beyond an account holder deliberately inducing another operator to work in the wrong session.

#### Existing controls and disconfirming evidence

- Preventive: `sameSite=lax`, `httpOnly`, safe-by-default `Secure`, React escaping, rejection of ordinary absolute and `//` redirects.
- Detective: None identified.
- Recovery: sign out and clear the session.
- Evidence sought that could disprove or reduce the finding: no CSRF token, Origin check, canonical URL parse, or backslash rejection exists.

#### Impact justification

The path supports phishing and misdirected record entry but does not itself expose the signed session or bypass API authorization.

#### Likelihood justification

It requires user interaction and account confusion; visible identity chrome may reveal the wrong account.

#### Minimal effective recommendation

Require an Origin/CSRF check on login and validate redirects by parsing against a fixed trusted origin, accepting only URLs whose parsed origin matches and whose path begins with exactly one forward slash.

#### Verification approach

Add table-driven tests for backslashes, encoded slashes, control characters, mixed schemes, and cross-origin login forms; assert all resolve to the local fallback.

#### Standards references

- OWASP ASVS V3/V5; CWE-352; CWE-601.

#### Disagreement or uncertainty

- None.

### SR-006 — Browser and transport hardening depends on unenforced deployment choices

- Iteration disposition: New
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
- Prior acceptance or deferral: None; TLS ownership is an open assumption
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001–AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-002, TB-003, TB-008
- Affected components: SSR headers, cookie configuration, Compose service link

#### Claim

The product does not assert HTTPS, HSTS, CSP, framing, or MIME-sniffing protection. Compose deliberately disables `Secure` and sends Bearer credentials over plain in-network HTTP, and no production mode prevents those values from being copied into an internet deployment.

#### Evidence

- `compose.yaml:47-54` uses `http://api:8000`, a published session secret, and `UNTANGLED_COOKIE_SECURE=false`.
- `frontend/app/auth/config.server.ts:25-45` safely defaults `Secure` on but accepts an explicit false value in every environment.
- `frontend/app/auth/session.server.ts:36-45` has appropriate cookie attributes.
- `frontend/app/routes/authenticated.tsx:36-39` does set `Cache-Control: private, no-store`, disconfirming the broadest cache-control concern.
- Repository search found no CSP, HSTS, `frame-ancestors`/X-Frame-Options, or X-Content-Type-Options.
- `frontend/app/root.tsx:25-35` loads Google Fonts, which must be accounted for in any CSP.

#### Preconditions and attack path

1. An operator adapts development Compose or terminates TLS differently from assumed.
2. Cookies or internal Bearer headers traverse plaintext, or authenticated pages lack browser containment against framing/injection.
3. A network-positioned or composed browser attacker captures or uses an operator session.

#### Legitimate-user abuse case

An operator explicitly disables secure cookies to make a pilot work and later exposes it without restoring transport protection.

#### Existing controls and disconfirming evidence

- Preventive: `Secure` defaults true; cookie is `httpOnly`, `sameSite=lax`, host-scoped; authenticated loader requests private/no-store caching.
- Detective: None identified.
- Recovery: secret replacement forces cookie/token invalidation only if both secrets are replaced.
- Evidence sought that could disprove or reduce the finding: customer TLS may mitigate exposure but is out of scope; no product-side production assertion or systemic header policy was found.

#### Impact justification

Captured access credentials enable impersonation, potentially administrative. Missing CSP/framing controls amplify injection and UI-redress chains.

#### Likelihood justification

Requires deployment error or network position; the safe cookie default reduces but does not remove that prerequisite.

#### Minimal effective recommendation

Define a production configuration that refuses insecure cookie and API transport settings, emit systemic security headers, and provide a CSP compatible with required assets.

#### Verification approach

Inspect production-mode startup and representative SSR responses; assert HTTPS assumptions, HSTS at the responsible layer, CSP, framing, MIME controls, and private/no-store on every authenticated document/data response.

#### Standards references

- OWASP ASVS V3/V12; OWASP Secure Headers guidance.

#### Disagreement or uncertainty

- Customer transport topology is explicitly out of scope, so likelihood cannot be confirmed from repository evidence alone.

### SR-007 — One class-read grant enables reliable, unrecorded whole-class extraction

- Iteration disposition: New
- Severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Broken access control / bulk data exfiltration
- CWE or equivalent: CWE-862, CWE-200
- Related threats: THR-011, THR-012, THR-017
- Related security requirements: None
- Prior acceptance or deferral: None; ASM-019/ASM-025 describe future direction only
- Prior-decision reassessment: Not applicable
- Affected assets: AST-004, AST-005, AST-009, AST-012
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Affected components: RBAC dependency, record fetch/search, audit fields

#### Claim

Authorization checks only `{class}:read`. A holder can project any field, match every row, page deterministically using `total`, and leave no read event. There is no row or attribute constraint.

#### Evidence

- `backend/src/untangled/rbac/dependencies.py:32-51` checks only one class-operation key.
- `records/router_factory.py:77-135,153-175` applies that dependency once to search/fetch.
- `persistence/search.py:137-179,231-259,284-325,329-343` exposes all mapped attributes, `WHERE TRUE`, total count, stable sorting, limit 200, and arbitrary offset.
- `backend/tests/test_search_api.py:51-66,153-169` explicitly verifies match-all and deterministic pagination.
- `mapping/system_fields.py` supplies write stamps; repository search found no read audit or volume detection.

#### Preconditions and attack path

1. A legitimate or compromised account has one class read permission.
2. It requests all attributes with no predicate and pages by offset.
3. The complete class is extracted; no security event records the reads.

#### Legitimate-user abuse case

A departing operator exports the corpus while remaining entirely within a granted permission.

#### Existing controls and disconfirming evidence

- Preventive: consistent class-level RBAC; 200-row per-request limit; validated attribute names; parameterized SQL.
- Detective: None identified for reads or cumulative volume.
- Recovery: credential/permission revocation stops future reads but cannot recover copied data.
- Evidence sought that could disprove or reduce the finding: no row predicate, attribute policy, cumulative quota, export control, or read log was found.

#### Impact justification

One ordinary credential can disclose a whole operational class and future infrastructure intelligence, with no reliable breach scoping.

#### Likelihood justification

The API is intentionally deterministic and scriptable; no bypass is needed.

#### Minimal effective recommendation

Define and enforce row/attribute authorization at the common attribute and query-resolution boundary, preserving non-existence semantics; add attributable bulk-read events and volume anomaly controls.

#### Verification approach

Create users with restricted row/field policies and assert identical denial behavior across fetch, projection, predicates, sorting, counts, legacy/v1 routes, and generated metadata.

#### Standards references

- OWASP ASVS V4/V7; OWASP A01; CWE-862.

#### Disagreement or uncertainty

- The future attribute model is explicitly unvetted, and record-level policy remains unresolved; neither reduces present exposure.

### SR-008 — Authenticated pattern search can exhaust the shared database

- Iteration disposition: New
- Severity: High
- Impact: High
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Security category: Algorithmic complexity / uncontrolled resource consumption
- CWE or equivalent: CWE-1333, CWE-770
- Related threats: THR-013
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-010, AST-011
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Affected components: predicate compiler, PostgreSQL connection path

#### Claim

Any class reader can send arbitrary PostgreSQL regular expressions and leading-wildcard patterns against long text with no pattern bound, statement timeout, query budget, rate limit, or pooled connection cap.

#### Evidence

- `persistence/search.py:34-51,54-88` enables regexp and expensive text operators for multiline text.
- `persistence/search.py:540-584` passes regexp directly as a parameter to PostgreSQL `~` and builds leading-wildcard LIKE queries.
- Result, nesting, and list bounds exist at `persistence/search.py:26-30,262-281,354-357,426-430`, but they bound output/shape rather than database work.
- `auth/dependencies.py:21-27` opens one connection per request.
- Repository search found no `statement_timeout`, cost budget, or connection pool.

#### Preconditions and attack path

1. A user has one class-read permission.
2. The user repeatedly applies expensive expressions to long fields.
3. Shared database CPU and connection slots are consumed, delaying all platform functions.

#### Legitimate-user abuse case

An operator runs an innocent broad substring or regexp search on a mature incident corpus and causes the same load.

#### Existing controls and disconfirming evidence

- Preventive: parameterization prevents SQL injection; result limit 200; bounded predicate tree; invalid regexp rollback.
- Detective: None identified.
- Recovery: query completion, connection/process termination, or external database intervention.
- Evidence sought that could disprove or reduce the finding: no timeout, pattern-length/complexity check, role gate, query plan budget, rate limiter, or pool cap was found.

#### Impact justification

The shared database is the availability dependency for an incident-management platform, so sustained exhaustion is material.

#### Likelihood justification

Requires an authenticated reader and actual cost varies by data/pattern, but the path is repeatable and low complexity.

#### Minimal effective recommendation

Set a conservative database statement timeout for interactive search, bound pattern size/complexity, apply per-principal search budgets, and use bounded connection pooling. Restrict especially costly operators if needed.

#### Verification approach

Run representative local load tests with adversarial patterns and large text; assert timeout, connection bounds, API recovery, and unaffected health/control requests.

#### Standards references

- OWASP ASVS V5/V13; CWE-1333; CWE-770.

#### Disagreement or uncertainty

- Runtime capacity was not measured; confidence in the reachable unbounded path is High, while exact saturation likelihood remains environment-dependent.

### SR-009 — Direct database authority and weak audit identity defeat accountability

- Iteration disposition: New
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
- Affected components: connection/CLIs, audit fields, stub actor, RBAC tables

#### Claim

One database credential supports application, migration, seed, and direct SQL authority. Out-of-band operations bypass RBAC and application audit, while the temporary system actor is the same UUID as the real seeded admin. Existing stamps record only the latest writer and are mutable by the same privileged path.

#### Evidence

- `persistence/connection.py:9-20`, `schema/cli.py:49-61`, and `seed/cli.py:24-39` use the same `DATABASE_URL`.
- `persistence/actor.py:1-12` defines a shared stub; `seed/users.py:11-12` makes it the real admin.
- `schema/migrate.py:105-124` can create the stub and execute DDL directly.
- `mapping/system_fields.py` provides only current created/updated identities and times.
- Repository search found no security audit subsystem, authentication/read events, tamper evidence, SIEM export, or separate database roles.

#### Preconditions and attack path

1. An operator or host compromise obtains `DATABASE_URL`.
2. Direct SQL changes role assignments, records, hashes, or audit columns without API checks.
3. The actor can erase or misattribute evidence, including plausibly blaming the shared admin/system identity.

#### Legitimate-user abuse case

An operator fixes data directly during an incident and leaves misleading application attribution.

#### Existing controls and disconfirming evidence

- Preventive: operator access is privileged by necessity; migrations are deliberate and versioned.
- Detective: schema version rows only; no data/RBAC/direct-access audit.
- Recovery: customer backups, outside product scope.
- Evidence sought that could disprove or reduce the finding: no least-privilege database roles, database audit facility, distinct system principal, immutable event store, or out-of-band change detector was found.

#### Impact justification

The path enables complete confidential, integrity, and authorization compromise while defeating investigation and non-repudiation.

#### Likelihood justification

Infrastructure access is a meaningful prerequisite but routine for the operator/insider population and a natural result of host compromise.

#### Minimal effective recommendation

Separate runtime, migration, seed, and human database roles; create a distinct non-human principal and channel; implement durable security events and database-level auditing for privileged changes with export and tamper resistance.

#### Verification approach

Attempt representative reads, RBAC writes, and DDL under each role; assert least privilege and independently verifiable attribution for every allowed privileged action.

#### Standards references

- OWASP ASVS V7; NIST SP 800-53 AU family; CWE-778.

#### Disagreement or uncertainty

- None.

### SR-010 — Anonymous callers receive the complete generated API schema

- Iteration disposition: New
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
- Affected components: FastAPI application and OpenAPI routes

#### Claim

Default FastAPI documentation endpoints and an identifying root response are anonymous, exposing every route, duplicated API surface, request model, field, and operation to internet scanners despite accepted intent permitting only a minimal health check.

#### Evidence

- `backend/src/untangled/main.py:18-46` creates `FastAPI()` without disabling docs/OpenAPI and exposes `/` plus `/health`.
- FastAPI defaults therefore expose `/docs`, `/redoc`, and `/openapi.json`.
- `records/router_factory.py:64-83,137-159` places detailed route and migration descriptions into that schema.
- Repository search found no environment-aware docs control or authentication wrapper.

#### Preconditions and attack path

1. The API is internet reachable.
2. An anonymous scanner requests `/openapi.json`.
3. The attacker receives a precise target map and combines it with credential/default/authentication findings.

#### Legitimate-user abuse case

None identified.

#### Existing controls and disconfirming evidence

- Preventive: endpoint operations themselves retain Bearer/RBAC dependencies.
- Detective: ordinary access logs may exist in Uvicorn, but no product security logging was found.
- Recovery: disable or authenticate documentation.
- Evidence sought that could disprove or reduce the finding: no production configuration or route dependency was found.

#### Impact justification

This is reconnaissance rather than direct compromise, but it fully enumerates the target and violates accepted fail-closed exposure intent.

#### Likelihood justification

One anonymous request; common scanners probe these defaults automatically.

#### Minimal effective recommendation

Disable documentation/OpenAPI and the identifying root outside explicit development, or protect them with authorization; keep only the required minimal health response public.

#### Verification approach

Run the production configuration and assert `/`, `/docs`, `/redoc`, and `/openapi.json` are absent or authorized while the minimal liveness check remains available.

#### Standards references

- OWASP ASVS V14; OWASP A05; CWE-200.

#### Disagreement or uncertainty

- None.

### SR-011 — Destructive schema escape hatches bypass the safe migration default

- Iteration disposition: New
- Severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Security category: Unsafe operational interface / data destruction
- CWE or equivalent: CWE-250, CWE-284
- Related threats: THR-020, THR-027
- Related security requirements: None
- Prior acceptance or deferral: None; class tiering is unimplemented intent
- Prior-decision reassessment: Not applicable
- Affected assets: AST-004, AST-005, AST-007, AST-011
- Relevant actors: ACT-005, ACT-006, ACT-013
- Trust boundaries: TB-007, TB-009
- Affected components: schema migration wrappers and future configuration promotion

#### Claim

The authoritative migration path correctly refuses destructive changes by default, but importable compatibility/reset helpers default to destruction or drop tables outright. No class-tier enforcement exists to protect authentication/authorization classes when configuration promotion arrives.

#### Evidence

- `schema/migrate.py:58-69,95-127` defaults safe, enumerates destructive operations, and applies transactionally after a restore point.
- `schema/cli.py:38-60` requires explicit `--allow-destructive`.
- `persistence/schema.py:18-34` defaults `apply_schema(... allow_destructive=True)`.
- `persistence/schema.py:37-73` exposes `sync_table`, which drops and recreates a table without version history or restore point.
- Class definitions carry no `system`/`foundation`/`implementation` enforcement; accepted ASM-021 states this is not yet implemented.

#### Preconditions and attack path

1. Trusted code, an operator tool, or future promotion code calls the permissive helper or explicitly overrides the gate.
2. A rename/drop or reset destroys data; absent tiers, a future configuration path could reach core schema.
3. Recovery depends on customer backups and attribution is absent.

#### Legitimate-user abuse case

A developer imports the compatibility helper because it is simpler, unaware its default is the inverse of the shared migration safety posture.

#### Existing controls and disconfirming evidence

- Preventive: authoritative migrate and CLI fail closed; destructive operations are named; apply is transactional; helpers are documented non-authoritative.
- Detective: schema versions for authoritative migrate only.
- Recovery: transaction rollback on failure; successful destructive operations require external backup.
- Evidence sought that could disprove or reduce the finding: no call from the current HTTP surface was found; this keeps likelihood Low. No technical restriction makes helpers test-only.

#### Impact justification

Successful destruction can irreversibly remove customer operational data; future core-schema reach would also affect authorization integrity.

#### Likelihood justification

Current exploitation requires trusted code/operator access and configuration promotion is absent. The risk is an attractive unsafe API and an unbuilt future boundary.

#### Minimal effective recommendation

Make every reusable schema API safe by default, isolate reset utilities to test tooling, require explicit typed destructive authorization with actor metadata, and enforce class tiers at load and migration boundaries before promotion exists.

#### Verification approach

Search all callers and add tests proving every non-test entry refuses destructive plans and every system-class mutation fails closed before any DDL.

#### Standards references

- OWASP ASVS V1/V14; CWE-250.

#### Disagreement or uncertainty

- The configuration exploit path is forward-looking and cannot be validated until promotion and tier enforcement exist.

### SR-012 — Dependency compromise reaches root-running application containers

- Iteration disposition: New
- Severity: High
- Impact: Critical
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Security category: Software supply chain / runtime containment
- CWE or equivalent: CWE-829, CWE-250
- Related threats: THR-019, THR-021, THR-024
- Related security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001–AST-005, AST-008, AST-010, AST-011
- Relevant actors: ACT-012, ACT-014
- Trust boundaries: TB-010, TB-011
- Affected components: Python/npm dependencies and runtime images

#### Claim

Dependencies are version-locked, but Python artifacts are not hash-pinned and no repository evidence shows SBOM, vulnerability/provenance verification, or runtime containment. Both final application images run as the image default root user, so compromised package code receives all process secrets and unnecessary container privilege.

#### Evidence

- `backend/requirements.lock:1-37` pins versions but includes no hashes.
- `frontend/package-lock.json` records npm integrity metadata and exact versions.
- `backend/Dockerfile:2-27` and `frontend/Dockerfile:38-47` define no non-root `USER`.
- Compose defines no read-only filesystem, capability drop, or no-new-privileges policy.
- Repository search found no SBOM or dependency scanning configuration; live external scanning was not performed.
- The API process holds JWT/database secrets; the SSR process holds the session secret and every active Bearer token in flight.

#### Preconditions and attack path

1. A poisoned or compromised pinned package is selected or its artifact source is subverted.
2. Package/build/runtime code executes with application privilege.
3. It reads signing secrets, database credentials, records, and sessions; root container execution increases post-compromise reach within the container.

#### Legitimate-user abuse case

Not applicable.

#### Existing controls and disconfirming evidence

- Preventive: exact resolved versions; npm integrity values; production frontend dependency pruning; multi-stage frontend build.
- Detective: None identified in repository scope.
- Recovery: rebuild/upgrade and secret rotation.
- Evidence sought that could disprove or reduce the finding: vendor CI/CD is excluded and may add controls; no product/repository SBOM, hash-locked Python input, signature/provenance check, or non-root runtime was found.

#### Impact justification

Dependency code executes inside the trust boundary and can compromise all secrets/data available to that process. Web-tier compromise exposes active sessions by design.

#### Likelihood justification

Lockfiles remove silent version drift, so compromise requires a poisoned selected artifact or deliberate update; that is plausible but uncommon.

#### Minimal effective recommendation

Hash-pin Python artifacts, produce an SBOM, verify dependency advisories/provenance in the release process, and run both final images as dedicated non-root users with minimal filesystem/capability access.

#### Verification approach

Verify reproducible locked installs, artifact hashes/provenance, SBOM coverage, image user/capabilities, and that runtime users cannot write application files or access unrelated secrets.

#### Standards references

- OWASP ASVS V1/V14; SLSA provenance concepts; CWE-829/CWE-250.

#### Disagreement or uncertainty

- No live advisory database or release-pipeline evidence was examined; the finding addresses missing in-repository controls, not a claim that a current package is vulnerable.

### SR-013 — Stock self-hosted releases lack a vulnerability-notification capability

- Iteration disposition: New
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
- Prior acceptance or deferral: None; ASM-009 is intent only
- Prior-decision reassessment: Not applicable
- Affected assets: AST-001, AST-004, AST-005, AST-011
- Relevant actors: ACT-005, ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004, TB-011, TB-014
- Affected components: stock release and customer notification process

#### Claim

The repository has no `SECURITY.md`, disclosure route, support/version policy, advisory channel, or product update notification. Stock self-hosted customers therefore have no defined path to report defects or learn they run a vulnerable release.

#### Evidence

- Repository file inventory contains no `SECURITY.md`.
- No advisory, supported-version, update-notification, or disclosure documentation was found.
- Accepted ASM-003/ASM-009 states customers self-host and patch, while vendor advisory publication remains intent.

#### Preconditions and attack path

1. A vulnerability is discovered and eventually made public.
2. Attackers identify internet-facing versions; customers receive no product-defined notification or support guidance.
3. Exposure persists through enterprise patch delay.

#### Legitimate-user abuse case

None identified.

#### Existing controls and disconfirming evidence

- Preventive: customers control deployment and can update.
- Detective: None identified for deployed versions or customer notification.
- Recovery: customer-applied release update.
- Evidence sought that could disprove or reduce the finding: private channels may exist outside the repository, but no evidence was supplied and the accepted model says capability is absent.

#### Impact justification

The eventual impact follows the disclosed vulnerability and can be platform-wide; delayed response leaves an internet-exposed population vulnerable.

#### Likelihood justification

Security defects and slow self-hosted enterprise patch cycles are expected over product lifetime.

#### Minimal effective recommendation

Publish a disclosure policy, supported-version policy, advisory channel, and customer notification/update mechanism before production release.

#### Verification approach

Run a tabletop disclosure: a reporter must find the channel, maintainers must publish a machine- and human-readable advisory, and a stock deployment/customer must have a documented way to determine affected status.

#### Standards references

- ISO/IEC 29147 vulnerability disclosure and 30111 handling concepts; OWASP ASVS V14.

#### Disagreement or uncertainty

- None.

### SR-014 — Parallel legacy and v1 record surfaces create future control-drift risk

- Iteration disposition: New
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
- Prior-decision reassessment: Still supported as a temporary compatibility approach; removal conditions remain undocumented
- Affected assets: AST-004, AST-005
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005
- Affected components: record router factory and API mounting

#### Claim

No present authorization bypass was found because both legacy and v1 routes share the same factory and dependency. Keeping two behavioral surfaces nevertheless makes future field/row authorization drift possible, and no parity test or usage/removal condition was found.

#### Evidence

- `records/router_factory.py:26-217` constructs both surfaces and applies the same `require_class_operation` dependency.
- `main.py:30-34` mounts both.
- Route descriptions mark legacy deprecated and reference issue #117, but no technical sunset condition or usage telemetry is present.

#### Preconditions and attack path

1. A future security control is added to one behavioral branch only.
2. Clients use the less restrictive legacy route.
3. The older route becomes an authorization bypass.

#### Legitimate-user abuse case

A client remains on the older route because a new control makes v1 requests fail.

#### Existing controls and disconfirming evidence

- Preventive: shared factory and identical current authorization dependency.
- Detective: OpenAPI deprecation only.
- Recovery: remove the legacy surface under tracked issue #117.
- Evidence sought that could disprove or reduce the finding: current call paths were compared and no authorization divergence was substantiated.

#### Impact justification

Any future divergence could expose class data, but no current exploit exists; therefore this is Informational rather than a vulnerability.

#### Likelihood justification

Shared construction makes present drift unlikely; likelihood rises as behavior branches.

#### Minimal effective recommendation

Define migration/removal conditions and add security parity tests for every control while both surfaces remain.

#### Verification approach

Run identical authorization test matrices against both surfaces and fail CI if statuses, visibility, predicates, or projections diverge unexpectedly.

#### Standards references

- OWASP ASVS V4; project API compatibility cleanup convention.

#### Disagreement or uncertainty

- None.

## 8. Iteration disposition ledger

| Item | Source | Disposition | Sol conclusion | Evidence and justification |
| --- | --- | --- | --- | --- |
| SR-001 | Sol iteration 1 | New | Critical default-key authentication bypass | Direct token path verified statically |
| SR-002 | Sol iteration 1 | New | Critical default-credential compromise | Seed, RBAC, DB, and Compose paths align |
| SR-003 | Sol iteration 1 | New | High authentication abuse and exhaustion | Unlimited route plus asymmetric Argon2 work |
| SR-004 | Sol iteration 1 | New | Medium session replay/termination gap | Existing immediate account/RBAC checks bound impact |
| SR-005 | Sol iteration 1 | New | Low login-integrity weakness | Browser URL normalization safely confirmed |
| SR-006 | Sol iteration 1 | New | High transport/browser hardening gap | Likelihood depends on excluded customer topology |
| SR-007 | Sol iteration 1 | New | High whole-class extraction | Authorization and pagination paths verified |
| SR-008 | Sol iteration 1 | New | High database exhaustion path | Actual threshold unmeasured |
| SR-009 | Sol iteration 1 | New | High accountability failure | Shared DB authority and identity collision verified |
| SR-010 | Sol iteration 1 | New | High anonymous reconnaissance | FastAPI defaults remain enabled |
| SR-011 | Sol iteration 1 | New | Medium destructive escape-hatch risk | No HTTP caller; future tier path unimplemented |
| SR-012 | Sol iteration 1 | New | High supply-chain blast radius | No claim of a currently vulnerable package |
| SR-013 | Sol iteration 1 | New | High vulnerability-management gap | Accepted model and repository evidence agree |
| SR-014 | Sol iteration 1 | New | Informational drift risk | No present bypass substantiated |
| Adversarial critique | Opus critique | Pending | Iteration 1 was independent | No adversarial artefact exists yet |

## 9. Threat coverage

| Threat ID | Relevant surface examined | Result | Finding IDs | Coverage limits |
| --- | --- | --- | --- | --- |
| THR-001 | JWT settings, signing, decode, admin identity | Finding | SR-001 | None |
| THR-002 | Seed, DB defaults, Compose, RBAC | Finding | SR-002 | None |
| THR-003 | Login route and password verification | Finding | SR-003 | No live attack |
| THR-004 | Argon2 and connection path | Finding | SR-003 | No load test |
| THR-005 | User lookup timing path | Finding | SR-003 | No network timing test |
| THR-006 | JWT claims, logout, active-user checks | Finding | SR-004 | None |
| THR-007 | Refresh claim/rotation and SSR custody | Finding | SR-004 | Non-browser clients absent |
| THR-008 | Login action, cookie, redirect validation | Finding | SR-005 | No remote target used |
| THR-009 | SSR headers and rendering | Finding | SR-006 | Cache-control propagation not runtime-inspected |
| THR-010 | React rendering and HTML sinks | No issue substantiated |  | React escaping present; future rich text absent |
| THR-011 | RBAC, fetch, search resolution | Finding | SR-007 | Future attribute design absent |
| THR-012 | Search projection/pagination/count | Finding | SR-007 | No mature corpus |
| THR-013 | Regexp/LIKE and DB connection | Finding | SR-008 | No load test |
| THR-014 | CLI and direct DB authority | Finding | SR-009 | Customer DB controls excluded |
| THR-015 | Stub actor and seeded admin | Finding | SR-009 | None |
| THR-016 | FastAPI root/docs/OpenAPI | Finding | SR-010 | None |
| THR-017 | Audit fields and repository logging | Finding | SR-007, SR-009 | No external SIEM evidence |
| THR-018 | Future configuration promotion | Insufficient evidence |  | Engine not implemented |
| THR-019 | Future customization runtime | Insufficient evidence | SR-012 | Sandbox/host not implemented |
| THR-020 | Migration and destructive helpers | Finding | SR-011 | Promotion absent |
| THR-021 | Lockfiles, images, dependencies | Finding | SR-012 | No live advisory/provenance scan |
| THR-022 | Disclosure/advisory capability | Finding | SR-013 | External private process not supplied |
| THR-023 | Cookie and service transport defaults | Finding | SR-006 | Customer TLS excluded |
| THR-024 | SSR secret/token custody | No independent issue substantiated | SR-012 | Requires prior web-tier compromise |
| THR-025 | Future account recovery | Insufficient evidence |  | Feature and delivery channel absent |
| THR-026 | Legacy/v1 router paths | No present issue substantiated | SR-014 | Future drift only |
| THR-027 | Future class-tier enforcement | Insufficient evidence | SR-011 | Control not designed/implemented |
| THR-028 | Future customization host identity | Insufficient evidence |  | Host and identity absent |

`No issue substantiated` does not prove absence of vulnerability; it records the result of the scoped evidence review.

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

- Full-review provenance is not classified. All findings exist at the pinned target commit.

### Provenance uncertainty

- Not applicable.

## 11. Prior accepted-risk reassessment

TM-REV-001 explicitly records that no individual risk was accepted. No finding was suppressed as accepted.

| Finding ID | Prior decision or rationale | Current evidence and security practice | Reassessment | Human review needed |
| --- | --- | --- | --- | --- |
| SR-001–SR-013 | No risk accepted | Implemented or operational control gaps substantiated | Rationale undocumented for tolerance | Yes |
| SR-014 | Temporary compatibility route; removal tracked by issue #117 | Shared factory prevents current bypass; sunset conditions absent | Still supported | Yes |

## 12. Attack chains and abuse cases

| Chain or abuse case | Component findings or threats | Combined path | Resulting risk |
| --- | --- | --- | --- |
| Silent-default takeover | SR-010 → SR-001 or SR-002 | Anonymous schema maps the API; published key or admin password supplies authority | Immediate total compromise |
| Undetected corpus extraction | SR-003 → SR-007 → SR-009 | One stuffed credential reads all rows/fields; no read trail scopes the breach | Wholesale confidential-data loss without evidence |
| Availability collapse | SR-003 + SR-008 | Anonymous Argon2 work and authenticated database pattern work consume separate chokepoints | Loss of incident-management capability |
| Session capture and persistence | SR-006 → SR-004 | Insecure transport captures a token; logout cannot terminate it | Guaranteed foothold until expiry |
| Privileged action without attribution | SR-002 or host compromise → SR-009 | Database authority changes RBAC/data and rewrites or confuses attribution | Full integrity loss and repudiation |
| Supply-chain credential harvest | SR-012 → SR-001/SR-004/SR-006 | Compromised dependency reads process secrets and active sessions | Broad durable compromise |

## 13. Disagreements

Adversarial review pending.

| Related item | Sol position | Opus position | Evidence for each | Resolution status |
| --- | --- | --- | --- | --- |
| All findings | Iteration 1 positions above | Pending | Opus artefact not yet produced | Open |

## 14. Unknowns and coverage gaps

| Related item | Unknown or gap | Why it matters | Evidence needed |
| --- | --- | --- | --- |
| SR-003, SR-008 | Actual resource saturation thresholds | Sets operational likelihood and safe defaults | Representative concurrent load and database telemetry |
| SR-006 | Customer TLS and internal service transport | Could reduce or realize credential interception | Production topology and response-header capture |
| SR-012 | Current dependency advisories and artifact provenance | Could identify a present vulnerable package or stronger external controls | Authorized SCA/SBOM/provenance results |
| THR-018, THR-027 | Configuration promotion and tier enforcement design | One future boundary protects core auth/RBAC schema | Design, normalization rules, enforcement points, tests |
| THR-019, THR-028 | Customization host, identity, isolation, resource and egress policy | Determines authority and sandbox escape blast radius | Accepted design and implementation |
| THR-025 | Recovery token and delivery design | Recovery can become direct account takeover | Accepted flow, token lifecycle, session invalidation tests |
| THR-009 | Systemic SSR header propagation | Loader-level no-store exists; final document/data behavior was not runtime captured | Built production response inspection |

## 15. Withdrawn or unsubstantiated candidates

| Candidate | Why it was considered | Disconfirming evidence | Final disposition |
| --- | --- | --- | --- |
| Present stored XSS | Free-text records render in SSR UI | React interpolation escapes by default; no `dangerouslySetInnerHTML` found | Not substantiated; re-review with rich text/custom rendering |
| SQL injection in predicate search | Client controls operators, attributes and values | Attributes resolve against definitions; identifiers use `psycopg.sql.Identifier`; values are placeholders | Withdrawn |
| Current legacy/v1 authorization bypass | Two data surfaces exist | Both use the same factory and permission dependency | Informational SR-014 only |
| Missing authenticated cache control everywhere | Threat model noted no cache controls | Authenticated loader sets `private, no-store` and tests assert it | Narrowed to SR-006; runtime propagation remains a gap |
| SSRF through arbitrary absolute path support | `api_fetch_with_token` accepts strings starting with `http` and attaches Bearer | All reviewed production callers construct fixed relative API paths after collection validation | Not presently reachable; remove absolute support as defense in depth |
| Current customization or recovery exploit | Threats are accepted forward-looking scope | No runtime, host, service identity, recovery endpoint, or delivery channel exists | Coverage gaps, not findings |

## 16. Completion

Finding counts:

- Critical: 2
- High: 8
- Medium: 2
- Low: 1
- Informational: 1
- Disputed: 0
- Uncertain: 4

`Uncertain` counts the four finding records with material implementation, environment, or external-evidence uncertainty: SR-003, SR-006, SR-011, and SR-012. Forward-looking configuration, customization, and recovery gaps remain separately visible in sections 9 and 14 but are not counted as findings.

Completion checks:

- [x] Inputs match the run manifest.
- [x] Accepted intent matches its pinned hash; diff and prior artefacts are not applicable.
- [x] Every finding has evidence and justified ratings.
- [x] Every finding links to applicable threat IDs.
- [x] Diff provenance is not applicable in full-review mode.
- [x] Every identified pre-existing weakness remains visible.
- [x] No previously accepted weakness exists; temporary API compatibility was reassessed.
- [x] Iteration 2 accounting is not applicable.
- [x] Disagreements and uncertainty are preserved.
- [x] Summary tables match authoritative detailed records.
