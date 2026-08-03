# Consolidated Security Findings

Status: Complete
Run ID: 20260803T113549Z-f074efdc579f-full-review-de0326
Orchestrator model: Composer (Cursor Auto)
Review mode: Full review
Prepared date: 2026-08-03
Governing status: Non-governing candidate findings

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
| Iteration 1 security review | `iteration-1/security-review.md` |
| Iteration 1 security-review SHA-256 | `8374cb9303db2b9e9a5b0767ccdde9a2a5abb38859db45aac3943bf45cd608f5` |
| Iteration 1 adversarial review | `iteration-1/adversarial-review.md` |
| Iteration 1 adversarial-review SHA-256 | `10b95d7369c7d475cfe8760adf4a17e84fe3fd95423f869c712c593fc0c9fcd7` |
| Iteration 2 security review | `iteration-2/security-review.md` |
| Iteration 2 security-review SHA-256 | `71539c1ac1ded48c4b2c2557dc06faecbe1cd8834cf3c1d74e520f0923a63e15` |
| Iteration 2 adversarial review | `iteration-2/adversarial-review.md` |
| Iteration 2 adversarial-review SHA-256 | `097f45e4cc048cb5efcfc442b8ca6072271dbcb00107a078b6e2b9e39ab44443` |

## 2. Scope

### In scope

- Full accepted TM-REV-001 scope plus implemented Milestone 1 code at the pinned commit, including forward-looking intent as modelled.

### Explicit exclusions

- Threat-model out-of-scope items only (physical/DC, customer infra, vendor CI/CD, customer config CI/CD, forks, multi-tenant shared DB).

### Scope limitations

- Static read-only analysis only; no load tests, live dependency advisory scan, production-role verification, TLS topology inspection, or built SSR document-response capture.
- Forward-looking surfaces (SSO, promotion, customization sandbox, recovery, CMDB, integrations, event bus, class tiering) remain coverage gaps, not findings.

## 3. Executive summary

### Overall assessment

This full-review consolidation yields twenty-one non-governing candidate findings. Two Critical paths remain: a published JWT signing-secret fallback that permits forged administrative tokens (including potentially non-expiring tokens), and published seed/database credentials on production-capable paths. The database branch’s blast radius is confirmed to reach database-container privilege under the shipped bootstrap superuser role. Nine High findings cover authentication abuse, transport/browser hardening, class-wide extraction, search amplification, weak accountability, anonymous schema exposure, supply-chain/container risk, vulnerability notification, and shared superuser-equivalent database authority. Medium findings cover session/logout gaps, login CSRF and open redirect, destructive schema helpers, FK enrichment disclosure, CLI secret printing, SSR credential concentration, and—new from the final adversarial pass—unrecorded authorized API deletion. One Low finding covers a shipped attribution default colliding with the stub actor. Two Informational observations cover legacy/v1 surface drift (with write-surface asymmetry corrected) and shipped demo scaffolding.

Zero unresolved Sol/Opus disagreements remain. Four final-pass Opus items (AR-013–AR-016) are consolidation corrections or missed-finding candidates, not contested positions. TM-REV-001 accepts no individual risk; prior decisions that do exist (ADR 002 concentration, ASM-024 provisional identifiers, issue #117 legacy removal, restore-point operational caveat) are reassessed explicitly.

### Highest-priority candidates

- FND-001 / FND-002 — silent development defaults yielding full administrative or database-container compromise on an internet-facing deployment.
- FND-011 (SR-015) — shared superuser-equivalent database role structurally required by unconditional restore points.
- FND-003 / FND-006 — anonymous login work and authenticated search amplification against shared availability chokepoints.
- FND-005 / FND-007 — unrecorded whole-class extraction and weak accountability under class-wide RBAC.

### Introduced risks, regressions, or exposure changes

- Not applicable — full-review mode; no change provenance assigned.

### Pre-existing weaknesses requiring attention

- All candidates exist at the pinned commit.
- Stub-actor / admin UUID collision (THR-015), absence of product-side deletion events, and legacy-as-sole-write-surface status remain visible in their own findings.

### Human decisions required

- Restore-point / production database-role split (FND-011 / HDN-001).
- Reference-visibility semantics under ASM-025 (FND-015 / HDN-002).
- Evidentiary standard for narrowing THR-009 and SSR document headers (FND-004 / HDN-003).
- Whether SSR concentration remains a standing constraint on THR-028 (FND-017 / HDN-004).
- Durable deletion event and soft-delete product choice (FND-018 / HDN-005).
- Issue #117 removal condition given legacy-only writes (FND-020 / HDN-006).

### Material disagreements and uncertainty

- Unresolved Sol/Opus disagreements: none.
- Material validation uncertainty: login and search saturation thresholds; SSR document cache headers; dependency advisories; customer production DB roles; destructive-helper operational patterns.

## 4. Consolidation method

### Deduplication basis

Items were merged only when they described the same underlying weakness, affected asset or trust boundary, materially equivalent attack path, and compatible control objective. AR-004 folded into SR-003; AR-005 into SR-008; AR-012 into SR-001/SR-004; AR-001 primarily into SR-015 (with SR-002/SR-009 composition); AR-002 into SR-016; AR-003 into SR-017; AR-009 into SR-018; AR-011 into SR-019. AR-015 and AR-016 are separate candidates because their attack paths and likelihood justifications are not those of SR-009.

### Ranking basis

Impact, likelihood, and provisional severity use TM-REV-001 section 9. Per AR-013, Informational findings (SR-014, SR-019) record impact and likelihood as Not applicable so no matrix result is implied; Low count of zero follows from that convention. No elevation outside the matrix is applied.

### Evidence boundary

This document synthesizes the four pinned review reports. It does not add a third implementation-analysis pass. AR-014’s write-surface facts and AR-015/AR-016 mechanisms are carried from Opus’s final-pass evidence already present in those reports.

## 5. Candidate finding summary

| Priority | ID | Finding | Status | Provenance | Confidence | Human decision |
| --- | --- | --- | --- | --- | --- | --- |
| Critical | FND-001 | Published signing-secret fallback permits arbitrary and potentially non-expir... | Supported | Not applicable | High | No |
| Critical | FND-002 | Production-capable seed and database paths accept published credentials | Supported | Not applicable | High | No |
| High | FND-003 | Login exposes unbounded authentication work to the shared API worker pool | Candidate — validation needed | Not applicable | High | No |
| High | FND-004 | Browser, API, and transport hardening depend on unenforced deployment choices | Human decision required | Not applicable | Medium | Yes |
| High | FND-005 | One class-read grant enables reliable, unrecorded whole-class extraction | Supported | Not applicable | High | No |
| High | FND-006 | Search amplification can exhaust the shared database | Candidate — validation needed | Not applicable | High | No |
| High | FND-007 | Direct database authority and weak audit identity defeat accountability | Supported | Not applicable | High | No |
| High | FND-008 | Anonymous callers receive the complete generated API schema | Supported | Not applicable | High | No |
| High | FND-009 | Dependency compromise reaches root-running application containers | Candidate — validation needed | Not applicable | Medium | No |
| High | FND-010 | Stock self-hosted releases lack a vulnerability-notification capability | Supported | Not applicable | High | No |
| High | FND-011 | Runtime, seed, and migration share a superuser-equivalent database role | Human decision required | Not applicable | High | Yes |
| Medium | FND-012 | Session termination and refresh replay response are incomplete | Supported | Not applicable | High | No |
| Medium | FND-013 | Login CSRF and a one-click authenticated open redirect weaken login integrity | Supported | Not applicable | High | No |
| Medium | FND-014 | Destructive schema escape hatches bypass the safe migration default | Candidate — validation needed | Not applicable | Medium | No |
| Medium | FND-015 | FK identity enrichment discloses referenced-class content without permission | Human decision required | Not applicable | High | Yes |
| Medium | FND-016 | Operator CLIs print live database and seed credentials | Supported | Not applicable | High | No |
| Medium | FND-017 | The SSR process concentrates all interactive credential material | Human decision required | Not applicable | High | Yes |
| Medium | FND-018 | Authorized API record deletion destroys the row and its attribution with no d... | Human decision required | Not applicable | High | Yes |
| Low | FND-019 | Shipped change-request requested-by create-default names the seeded administr... | Supported | Not applicable | High | No |
| Informational | FND-020 | Parallel legacy and v1 record surfaces create control-drift risk | Human decision required | Not applicable | High | Yes |
| Informational | FND-021 | Demo schema, permissions, and RBAC probe ship in the production surface | Supported | Not applicable | High | No |

This table is derived from the detailed finding records, which are authoritative.

## 6. Detailed candidate findings

### FND-001 — Published signing-secret fallback permits arbitrary and potentially non-expiring administrative JWTs

- Status: Supported
- Provisional severity: Critical
- Impact: Critical
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-001, iteration-2/SR-001
- Related Opus critiques (iteration-qualified): iteration-1/AR-012, iteration-2/AR-012
- Related threats: THR-001, THR-006
- Existing security requirements: None
- Prior acceptance or deferral: None; ASM-007 fail-closed intent
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

If the API uses the missing or published HS256 secret, any repository reader can mint an administrative access token. The decoder requires `sub` and `typ` but not `exp` or `iat`, so a forged token can omit expiry entirely.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `auth/settings.py:15-20` returns a published literal fallback; `compose.yaml:25-30` supplies the same value. - `auth/tokens.py:27-33` mints `sub`, `iat`, `exp`, `typ`; lines 41-50 decode with an algorithm allowlist but no `options={"require": [...]}`, issuer, or audience. - PyJWT 2.13 validates `exp` only when present by default. - `seed/users.py:11-13` publishes the admin UUID; `auth/dependencies.py:43-51` and `rbac/dependencies.py:32-51` accept the active subject and resolve live admin authority.

#### Preconditions and attack path

1. The API uses the absent or copied development secret and the seeded admin remains active. 2. The attacker signs `{"sub": "<published-admin-uuid>", "typ": "access"}` with no `exp`. 3. The API validates it indefinitely, subject only to key rotation or account deactivation, and resolves current administrator permissions.

#### Legitimate-user abuse case

Any repository reader can test a deployment for the known key without an account.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: HS256 allowlist; active-user and live-permission resolution; product-minted tokens have expiry. - Detective: None identified. - Recovery: secret rotation or account deactivation. - Disconfirming evidence: the web cookie secret fails closed, but direct API access bypasses the web tier. Claim validation does not require timing claims.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Critical JWT fallback; iteration 2 added missing required-claim gap from AR-012.
- Opus: Supported; AR-012 claim-set correction verified. No further disagreement.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Critical from impact Critical and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Require an explicit high-entropy key, reject known development values outside an explicit local mode, and require `sub`, `typ`, `iat`, and `exp`. Add issuer/audience binding when multiple keys or issuers exist.

#### Verification or acceptance approach

Assert production startup fails for missing/known keys; assert tokens missing each required claim fail; assert a repository-key token is rejected.

#### Dependencies and sequencing

- Issue #67 may narrow HS256 but does not fix the fallback.

#### Suggested refinement targets

- Authentication secrets and JWT claim validation.

#### Evidence or human decision still needed

- None

### FND-002 — Production-capable seed and database paths accept published credentials

- Status: Supported
- Provisional severity: Critical
- Impact: Critical
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-002, iteration-2/SR-002
- Related Opus critiques (iteration-qualified): iteration-1/AR-001, iteration-2/AR-001, iteration-1/AR-003, iteration-2/AR-003
- Related threats: THR-002
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Production-capable paths can create a fixed allow-all administrator and connect to PostgreSQL using published credentials with no production guard. Under shipped Compose, the database principal is the bootstrap superuser, extending compromise to database-container command/file authority.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `seed/users.py:31-77` defines fixed identities and default passwords, including `admin-change-me`. - `seed/cli.py:24-39` seeds without a production guard. - `persistence/connection.py:9-20` silently defaults to `untangled:untangled`. - `compose.yaml:4-11,22-32` provisions `POSTGRES_USER=untangled`, publishes PostgreSQL/API ports, and uses those credentials. - `seed/rbac_catalog.py:118-125,168-173` grants admin allow-all. - `schema/versions.py:58-66` confirms local Compose `untangled` is superuser-equivalent; SR-015 details privilege sharing.

#### Preconditions and attack path

1. An operator seeds without overrides or exposes a deployment using copied defaults. 2. An attacker logs in as admin or connects to PostgreSQL. 3. The attacker obtains complete application/database authority; on the shipped database role, server-program and server-file privileges are available.

#### Legitimate-user abuse case

An operator uses the documented defaults to make a deployment work, intending to rotate later; no control forces rotation.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: conspicuous `-change-me` names; environment overrides; seeding is deliberate. - Detective: CLI output reports values but creates no durable event and itself leaks secrets (SR-017). - Recovery: manual credential replacement and investigation. - Disconfirming evidence: no environment classification, first-use change, known-default rejection, or production refusal exists.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Critical published credentials; blast radius widened with SR-015 superuser role.
- Opus: Supported; privilege escalation and credential-logging channel recorded via AR-001/AR-003.
- Agreement: Full agreement.
- Disagreement: None.

#### Provisional assessment

Provisional severity Critical from impact Critical and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Fail closed on absent/known database and seed secrets outside a local fixture; generate unique bootstrap credentials, force controlled first-use change, and pair this with SR-015 role separation.

#### Verification or acceptance approach

Assert production startup/seed fails before database mutation for absent or known values and that the runtime role cannot execute server programs.

#### Dependencies and sequencing

- Composes with FND-003 (shared superuser role) and FND-015 (CLI secret print).

#### Suggested refinement targets

- Seed and database credential fail-closed defaults.

#### Evidence or human decision still needed

- None

### FND-003 — Login exposes unbounded authentication work to the shared API worker pool

- Status: Candidate — validation needed
- Provisional severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-003, iteration-2/SR-003
- Related Opus critiques (iteration-qualified): iteration-1/AR-004, iteration-2/AR-004
- Related threats: THR-003, THR-004, THR-005
- Existing security requirements: None
- Prior acceptance or deferral: ASM-006; issue #33
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Anonymous callers can make unlimited login attempts with no request-body or password-length bound. Known active usernames trigger Argon2 while unknown/inactive users return early. All API routes are synchronous and share the bounded AnyIO worker pool, so login work can deny record traffic as well as authenticate guesses and expose coarse username timing.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `auth/routes.py:42-52` defines an unthrottled synchronous login using `OAuth2PasswordRequestForm`. - `auth/passwords.py:5-21` uses `PasswordHasher()` defaults; `auth/store.py:55-62` returns before hashing for unknown/inactive users. - Record handlers in `records/router_factory.py:47,85,160,180,200` are also synchronous. - `backend/Dockerfile:27` sets no concurrency limit; `main.py` registers no limiting middleware. - No body limit, password-length cap, rate limiter, lockout, auth-event log, or hash concurrency budget was found.

#### Preconditions and attack path

1. The internet login is reachable; the admin username is public. 2. Concurrent large form requests for a valid username buffer input and perform Argon2 work. 3. Worker threads, CPU, memory, and per-request database connections are consumed; authenticated routes queue behind the same pool.

#### Legitimate-user abuse case

An insider can grind another user's password through the normal endpoint without a security event.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: Argon2id raises guess cost; generic response; inactive users fail. - Detective: None identified. - Recovery: process/orchestrator restart. - Disconfirming evidence: the early return reduces unknown-user work but creates enumeration. A dummy hash alone would increase attacker work unless input is bounded first.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High; body/password/pool mechanisms from AR-004.
- Opus: Supported; mechanism and control ordering complete (AR-004).
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Candidate — validation needed.

#### Minimal effective control objective

Bound HTTP body and password length before hashing; add failure-safe per-account/source throttles and a global hash-concurrency budget or isolated execution; then use a fixed dummy verification and emit privacy-conscious auth events.

#### Verification or acceptance approach

Use a local representative fixture to measure known/unknown timing and concurrent oversized-password behavior; assert body rejection, bounded hash concurrency, stable backoff, and responsive control/record routes.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Saturation thresholds unmeasured; load test required.

### FND-004 — Browser, API, and transport hardening depend on unenforced deployment choices

- Status: Human decision required
- Provisional severity: High
- Impact: High
- Likelihood: Medium
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-006, iteration-2/SR-006
- Related Opus critiques (iteration-qualified): iteration-1/AR-006, iteration-2/AR-006
- Related threats: THR-009, THR-023
- Existing security requirements: None
- Prior acceptance or deferral: TLS ownership and systemic cache handling remain open
- Prior-decision reassessment: Human reconsideration needed
- Human decision required: Yes

#### Consolidated claim

The product does not systemically assert HTTPS, HSTS, CSP, framing, MIME-sniffing, or cache protection. Compose disables `Secure`, uses plain HTTP for Bearer forwarding, and exposes the API. A loader requests `private, no-store`, but repository evidence does not establish that it reaches SSR document responses.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `compose.yaml:47-54` uses `http://api:8000`, a published session secret, and `UNTANGLED_COOKIE_SECURE=false`; API port 8000 is published. - `config.server.ts:25-45` defaults `Secure` on but accepts false in every environment; `session.server.ts:36-45` otherwise uses strong attributes. - `routes/authenticated.tsx:36-39` sets a loader `data()` header; no frontend route exports `headers`; its unit test inspects the loader object, not a built response. - `main.py` registers no security/cache middleware. Repository searches found no CSP, HSTS, framing, or MIME policy.

#### Preconditions and attack path

1. Development transport settings reach an internet deployment, or an authenticated response traverses a shared cache. 2. Cookies/Bearer tokens traverse plaintext, documents may be cached, or browser containment against framing/injection is absent. 3. A network-positioned or composed browser attacker captures or acts through an operator session.

#### Legitimate-user abuse case

An operator disables secure cookies for a pilot and exposes it later without restoring transport protection.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: `Secure` defaults true; cookie is host-scoped, `httpOnly`, `sameSite=lax`; authenticated loader requests no-store. - Detective: None identified. - Recovery: rotate both session and JWT secrets. - Disconfirming evidence: customer TLS may mitigate but is excluded; document-level cache propagation is unverified, not credited.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High; cache-control narrowing withdrawn; API tier added.
- Opus: Supported; narrowing correctly withdrawn. Substantive header question open for design/human ruling.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence Medium. Status Human decision required.

#### Minimal effective control objective

Define a production mode that refuses insecure cookie/API transport, apply systemic web and API security/cache headers, and supply CSP compatible with required assets.

#### Verification or acceptance approach

Capture raw production SSR document/data and API responses; assert transport assumptions, HSTS at the responsible layer, CSP, framing, MIME, and private/no-store behavior.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Document-header capture still needed; human decision on whether THR-009 may be narrowed.

### FND-005 — One class-read grant enables reliable, unrecorded whole-class extraction

- Status: Supported
- Provisional severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-007, iteration-2/SR-007
- Related Opus critiques (iteration-qualified): iteration-1/AR-002, iteration-2/AR-002, iteration-2/AR-014
- Related threats: THR-011, THR-012, THR-017
- Existing security requirements: None
- Prior acceptance or deferral: ASM-019/ASM-025 describe future direction only
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Authorization checks only `{class}:read`; a holder can project any source field, match every row, page deterministically using `total`, and leave no read event. No row or attribute constraint exists.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `rbac/dependencies.py:32-51` checks one class-operation key. - `records/router_factory.py:77-175` applies it once to search/fetch. - `persistence/search.py:137-179,231-259,284-326` exposes mapped attributes, `WHERE TRUE`, mandatory total, stable sort, limit 200, arbitrary offset. - Tests verify match-all and pagination; no read audit or cumulative volume detection was found. - Cross-class enrichment is separated into SR-016 rather than hidden here.

#### Preconditions and attack path

1. A legitimate or compromised account holds one class-read permission. 2. It requests all fields with no predicate and pages by offset. 3. It extracts the full class without a read security event.

#### Legitimate-user abuse case

A departing operator exports the corpus entirely within granted permission.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: consistent class RBAC; 200-row response cap; validated attributes; parameterized SQL. - Detective: None for reads/cumulative volume. - Recovery: revoke future access; copied data cannot be recovered. - Disconfirming evidence: no row predicate, field policy, cumulative quota, export gate, or read log exists.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High whole-class extraction; cross-class disclosure separated to SR-016.
- Opus: Supported; write-side future authorization has only one implementation point (AR-014 note).
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Enforce row/attribute authorization at common resolution boundaries with non-existence semantics and add attributable bulk-read events and volume controls.

#### Verification or acceptance approach

Test restricted principals across fetch, projection, predicate, sort, count, legacy/v1, and metadata surfaces.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-006 — Search amplification can exhaust the shared database

- Status: Candidate — validation needed
- Provisional severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-008, iteration-2/SR-008
- Related Opus critiques (iteration-qualified): iteration-1/AR-005, iteration-2/AR-005
- Related threats: THR-013
- Existing security requirements: None
- Prior acceptance or deferral: THR-013 keeps regexp but requires mitigation
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

One class reader can submit roughly 2,500 arbitrary PostgreSQL regexp leaves in one request. The same predicate is evaluated by an unconditional full-class `COUNT(*)` and again by the SELECT. Pattern size, total predicate count, sort-key count, offset, statement time, query budget, rate, and connection concurrency are unbounded.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `persistence/search.py:26-30,354-357,405-436` permits depth 3 and 50 children at each of two logical levels. - Lines 172-179 and 231-239 compile/execute the predicate for COUNT and SELECT. - Lines 274-281 and `records/search_models.py:57` bound offset only below; `_resolve_sort` has no list bound or deduplication. - Lines 540-584 pass regexp to PostgreSQL and create leading-wildcard LIKE. - `destination_list.tsx:195-222` and `pagination.ts:154-186` make predicate/large safe-integer offset browser-reachable. - No statement timeout, pool, cost budget, pattern bound, or per-principal throttle was found.

#### Preconditions and attack path

1. A browser or API user holds one class-read permission. 2. One predicate contains fifty logical groups of fifty non-matching expensive regex leaves. 3. PostgreSQL evaluates them across the class for COUNT and again for SELECT; concurrent requests or a huge sorted offset compound work.

#### Legitimate-user abuse case

An operator runs a broad filter or pages deeply through a mature corpus and triggers the same expensive plan.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: parameterization; response limit 200; depth/list bounds; invalid-regexp rollback; LIKE metacharacters escaped. - Detective: None identified. - Recovery: query/process termination or external database intervention. - Disconfirming evidence: response limit does not constrain COUNT; nesting limits positively permit the multiplier.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High likelihood after quantified amplification.
- Opus: Supported; ~2,500-leaf ceiling independently re-derived.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Candidate — validation needed.

#### Minimal effective control objective

Set interactive statement timeouts; cap total predicates, pattern length/complexity, sort keys, and offset; apply principal query budgets and bounded pooling; gate especially expensive operators as needed.

#### Verification or acceptance approach

Load-test representative data with maximum trees, adversarial regex, COUNT, and deep offsets; assert timeouts, connection bounds, and responsive control traffic.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Saturation thresholds unmeasured.

### FND-007 — Direct database authority and weak audit identity defeat accountability

- Status: Supported
- Provisional severity: High
- Impact: High
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-009, iteration-2/SR-009
- Related Opus critiques (iteration-qualified): iteration-1/AR-001, iteration-2/AR-001, iteration-1/AR-003, iteration-2/AR-003, iteration-2/AR-015, iteration-2/AR-016
- Related threats: THR-014, THR-015, THR-017
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Database access bypasses RBAC and application audit. One credential spans runtime, migration, seed, and direct SQL; the stub system actor equals the real seeded admin; audit stamps are mutable latest-writer fields. SR-015 shows the shared role is superuser-equivalent under shipped defaults, while SR-017 shows the credential is printed.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `persistence/connection.py`, `schema/cli.py`, `seed/cli.py`, and auth DB dependency use the same connection path. - `persistence/actor.py` and `seed/users.py:11-12` collide system/admin UUIDs; `schema/migrate.py:105-115` invokes the stub path. - `mapping/system_fields.py` records only current create/update identity/time. - No durable security audit, read/auth/permission events, tamper evidence, SIEM export, or separate roles exist. - Writable API models exclude system fields, bounding direct stamp forgery to privileged/non-HTTP paths.

#### Preconditions and attack path

1. An operator, leaked log reader, host compromise, or API compromise obtains database authority. 2. Direct SQL changes data/RBAC/audit fields without application checks. 3. The actor erases or ambiguously attributes evidence to admin/automation.

#### Legitimate-user abuse case

An operator fixes a record in SQL, leaving misleading attribution.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: operator access is deliberately privileged; migrations are versioned; API write models forbid system fields. - Detective: schema versions only. - Recovery: customer backups, outside product scope. - Disconfirming evidence: no least-privilege role split, database audit, distinct system identity, immutable event stream, or out-of-band detector.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High; superuser and CLI leakage composition; does not cover authorized API deletion.
- Opus: Supported for direct-database authority; under-engineered relative to AR-015 deletion gap.
- Agreement: Agreement on DB-authority claim; deletion gap carried separately.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Separate runtime, migration, seed, and human roles subject to SR-015's restore-point constraint; use a distinct system principal/channel; add durable exported security events and database-level privileged-change audit.

#### Verification or acceptance approach

Test each role against representative reads, RBAC writes, DDL, restore points, and server programs; verify independently durable attribution.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None — authorized API deletion is separate FND-018.

### FND-008 — Anonymous callers receive the complete generated API schema

- Status: Supported
- Provisional severity: High
- Impact: Medium
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-010, iteration-2/SR-010
- Related Opus critiques (iteration-qualified): iteration-1/AR-011, iteration-2/AR-011
- Related threats: THR-016
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Anonymous FastAPI defaults expose every route, model, field, legacy duplicate, demo probe, and service identifier despite intent permitting only minimal liveness. Validation responses return full Pydantic errors including echoed input.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `main.py:18-46` enables default `/docs`, `/redoc`, `/openapi.json`, `/`, and `/health`. - `records/router_factory.py` places route/migration detail in OpenAPI. - `request_validation.py:54-63` returns `jsonable_encoder(exc.errors())`, including input values. - No production docs control or authentication wrapper exists.

#### Preconditions and attack path

1. The API is internet reachable. 2. A scanner requests OpenAPI/root and malformed inputs. 3. It receives a target map and combines it with default/auth findings.

#### Legitimate-user abuse case

None identified.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: actual operations retain Bearer/RBAC dependencies. - Detective: ordinary server access logs may exist; no product event was found. - Recovery: disable/authenticate docs and minimize validation output. - Disconfirming evidence: no environment-aware route control exists.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High anonymous schema exposure.
- Opus: Supported.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact Medium and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Disable or authorize docs/OpenAPI/root outside development, retain only minimal liveness, and avoid echoing sensitive rejected input.

#### Verification or acceptance approach

Assert production responses for root/docs/schema and malformed secret-bearing requests reveal only authorized/minimal data.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-009 — Dependency compromise reaches root-running application containers

- Status: Candidate — validation needed
- Provisional severity: High
- Impact: Critical
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-012, iteration-2/SR-012
- Related Opus critiques (iteration-qualified): iteration-1/AR-008, iteration-2/AR-008, iteration-1/AR-009, iteration-2/AR-009
- Related threats: THR-021, THR-024
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Dependencies are locked, but Python artifacts lack hashes and repository evidence shows no SBOM/advisory/provenance verification. Both final images run as root without containment, so compromised package code receives process secrets and unnecessary container privilege.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `backend/requirements.lock` pins versions without hashes; npm lock records integrity. - Both Dockerfiles lack `USER`; Compose lacks read-only filesystem, capability drop, and no-new-privileges. - No repository SBOM or dependency scan configuration was found. - API holds JWT/database secrets; SSR holds its cookie secret and handles credentials/tokens, separately recorded in SR-018.

#### Preconditions and attack path

1. A poisoned selected artifact or compromised pinned artifact executes. 2. Code runs with application and root-container privilege. 3. It reads secrets/data and may use the superuser database path from SR-015.

#### Legitimate-user abuse case

None identified.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: exact versions; npm integrity; production pruning; multi-stage frontend. - Detective: None in repository scope. - Recovery: rebuild/upgrade and rotate secrets. - Disconfirming evidence: vendor CI/CD is excluded and may add controls; no current-vulnerability claim is made.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High supply-chain/container risk; THR-019 link removed.
- Opus: Supported; concentration separated to SR-018.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact Critical and likelihood Low under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence Medium. Status Candidate — validation needed.

#### Minimal effective control objective

Hash-pin Python, generate SBOMs, verify advisories/provenance, run dedicated non-root users, and minimize filesystem/capability/egress access.

#### Verification or acceptance approach

Verify locked artifact hashes, SBOM/advisory coverage, image users/capabilities, and runtime write/secret boundaries.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Authorized SCA/SBOM/provenance scan not performed.

### FND-010 — Stock self-hosted releases lack a vulnerability-notification capability

- Status: Supported
- Provisional severity: High
- Impact: High
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-013, iteration-2/SR-013
- Related Opus critiques (iteration-qualified): None
- Related threats: THR-022
- Existing security requirements: None
- Prior acceptance or deferral: ASM-009 is intent only
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

No `SECURITY.md`, disclosure route, support policy, advisory channel, or product update notification exists, leaving stock self-hosted customers without a defined report or notification path.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - Repository inventory contains no `SECURITY.md` or equivalent policy/channel. - ASM-003/ASM-009 make customers self-host and patch while advisory publication remains intent.

#### Preconditions and attack path

1. A released vulnerability becomes known. 2. Attackers identify exposed versions; customers receive no stock-product guidance. 3. Exposure persists through enterprise patch delay.

#### Legitimate-user abuse case

None identified.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: customers can update. - Detective: None for deployed versions/notification. - Recovery: customer-applied update. - Disconfirming evidence: no supplied private process; accepted intent says capability is absent.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: High notification gap.
- Opus: Supported; independently confirmed no SECURITY.md or disclosure channel.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact High and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Publish disclosure/support/advisory policies and a customer notification/update mechanism before production release.

#### Verification or acceptance approach

Tabletop a report, advisory, affected-version determination, and customer notification.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-011 — Runtime, seed, and migration share a superuser-equivalent database role

- Status: Human decision required
- Provisional severity: High
- Impact: Critical
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-2/SR-015
- Related Opus critiques (iteration-qualified): iteration-1/AR-001, iteration-2/AR-001, iteration-2/AR-013
- Related threats: THR-002, THR-014, THR-020, THR-021
- Existing security requirements: None
- Prior acceptance or deferral: Restore-point privilege documented operationally, not accepted as security risk
- Prior-decision reassessment: Rationale undocumented
- Human decision required: Yes

#### Consolidated claim

The API runtime, migration, and seed all use one database credential. Every non-empty migration unconditionally creates a restore point requiring superuser or equivalent privilege, and shipped Compose makes that same principal the PostgreSQL bootstrap superuser. SQL compromise therefore reaches database-server program execution/file access; runtime least privilege is absent.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `schema/versions.py:58-66` calls `pg_create_restore_point` and documents superuser/equivalent privilege and local Compose superuser status. - `schema/migrate.py:100-103` invokes it unconditionally for non-empty plans. - `persistence/connection.py:9-20`, `auth/dependencies.py`, `schema/cli.py:54`, and `seed/cli.py:27` share `connect()`. - `compose.yaml:6-11` provisions `POSTGRES_USER=untangled`, the bootstrap superuser, and publishes the port. - PostgreSQL restricts `COPY ... FROM PROGRAM` and server-file roles to superuser/equivalent privilege.

#### Preconditions and attack path

1. An attacker gets the default DB credential, reads it from SR-017 output, or compromises the API through SR-012. 2. The connection is the shipped bootstrap superuser. 3. The attacker runs server programs or reads server files as the database OS identity and pivots within the database container.

#### Legitimate-user abuse case

An operator uses the same convenient role for runtime and migration because the product's restore-point step otherwise fails.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: database reachability may be restricted by customer infrastructure; excluded and not assumed. - Detective: None in product scope. - Recovery: rotate credentials, rebuild database host, restore/investigate. - Disconfirming evidence: a customer-created non-superuser runtime plus separate privileged migration role removes the path, but no product default/check/guidance enforces it.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: New High; shared superuser-equivalent role.
- Opus: Supported; restore-point unconditionality and Compose bootstrap role confirmed. Uncertainty on production roles.
- Agreement: Agreement on core claim after iteration 2.
- Disagreement: None as contested Sol/Opus positions.

#### Provisional assessment

Provisional severity High from impact Critical and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Human decision required.

#### Minimal effective control objective

Use separate least-privilege runtime, migration, seed, and human roles. Make restore-point creation optional or isolate its privilege so normal DDL migration does not force superuser-equivalent authority; forbid server-program/file roles for application identities.

#### Verification or acceptance approach

Run runtime operations under a restricted role; migrate under a separately scoped role; assert runtime/seed cannot create restore points, execute server programs, read server files, or perform unrelated DDL.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Product decision on restore-point privilege and production role split; customer role design unknown.

### FND-012 — Session termination and refresh replay response are incomplete

- Status: Supported
- Provisional severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-004, iteration-2/SR-004
- Related Opus critiques (iteration-qualified): iteration-1/AR-012, iteration-2/AR-012
- Related threats: THR-006, THR-007
- Existing security requirements: None
- Prior acceptance or deferral: Token revocation deferred; issue #67
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Logout cannot terminate access JWTs; TTLs have no ceiling; token validation does not require expiry; refresh rotation detects only current validity, not family reuse; and the SSR discards the refresh token but leaves its row active until expiry.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `auth/tokens.py:23-50` has no `jti` and no required-claim list. - `auth/settings.py:23-30` accepts unbounded TTLs. - `auth/store.py:74-87,138-160` atomically rotates but records no family/reuse event. - `auth/routes.py:68-71` revokes only a presented refresh token. - `frontend/app/auth/api.server.ts:22-50` discards refresh; `logout.tsx` destroys only the cookie. - Per-request active-user and RBAC checks promptly stop deactivated/revoked authority.

#### Preconditions and attack path

1. An attacker obtains an access or future non-browser refresh token. 2. Logout does not terminate access; replay does not invalidate the refresh family. 3. The attacker continues until expiry, indefinitely for a forged token without `exp`, or keeps a refresh chain alive.

#### Legitimate-user abuse case

A departing user uses a captured token during its remaining validity.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: short default access TTL; opaque digest-only refresh tokens; atomic rotation; live account/permission checks. - Detective: None for replay. - Recovery: account deactivation immediately blocks requests; key rotation invalidates JWTs. - Disconfirming evidence: refresh exposure is presently low because the SSR discards it.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-004.
- Opus: Supported after independent re-verification.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact Medium and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Require and ceiling timing claims; add deliberate access-session revocation, refresh-family lineage/reuse response, security events, and consistent SSR issuance/revocation behavior.

#### Verification or acceptance approach

Test missing claims, issue/rotate/replay/logout/deactivate/revoke flows and assert both denial and security events.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-013 — Login CSRF and a one-click authenticated open redirect weaken login integrity

- Status: Supported
- Provisional severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-005, iteration-2/SR-005
- Related Opus critiques (iteration-qualified): iteration-1/AR-007, iteration-2/AR-007
- Related threats: THR-008
- Existing security requirements: None
- Prior acceptance or deferral: Login CSRF deferred under ADR 002; redirect bypass was not considered
- Prior-decision reassessment: Conditions changed
- Human decision required: No

#### Consolidated claim

The login POST lacks CSRF/origin control, enabling forced login to an attacker account. Independently, `safe_next_path` accepts `/\host`; WHATWG normalization makes it cross-origin. An already authenticated victim follows one genuine-domain link and the login loader redirects immediately to the attacker.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `frontend/app/routes/login.tsx:16-24` redirects an existing session to the accepted `next`; lines 26-54 commit login with no CSRF/origin check. - `frontend/app/auth/next_path.ts:5-15` checks forward slashes and `://` but not backslashes. - Existing tests cover ordinary absolute/protocol-relative URLs, not backslashes. - The host-scoped `httpOnly`, `sameSite=lax` cookie is not sent to the attacker origin.

#### Preconditions and attack path

1. Redirect path: a signed-in operator clicks `/login?next=%2F%5Cattacker.example%2Flogin`. 2. The loader accepts and redirects; the browser normalizes to the attacker origin, enabling trusted-domain phishing. 3. CSRF path: a hostile page submits attacker credentials; the victim later enters data into the attacker's session.

#### Legitimate-user abuse case

An account holder can induce another operator to work in the wrong session.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: `sameSite=lax`, `httpOnly`, secure-by-default cookie, React escaping, ordinary `//`/absolute rejection. - Detective: None identified. - Recovery: sign out and clear the session. - Disconfirming evidence: cookie custody prevents direct token disclosure; the redirect still supports phishing.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-005.
- Opus: Supported after independent re-verification.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact Medium and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Require a login Origin/CSRF check and parse redirects against a fixed trusted origin, accepting only same-origin paths with normalized separators.

#### Verification or acceptance approach

Table-test backslashes, encodings, controls, mixed schemes, and loader/action behavior; test cross-origin login forms.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-014 — Destructive schema escape hatches bypass the safe migration default

- Status: Candidate — validation needed
- Provisional severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: Medium
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-011, iteration-2/SR-011
- Related Opus critiques (iteration-qualified): iteration-1/AR-008, iteration-2/AR-008, iteration-2/AR-015
- Related threats: THR-020
- Existing security requirements: None
- Prior acceptance or deferral: Class tiering is unimplemented intent
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

The authoritative migration path refuses destructive changes by default, but importable compatibility/reset helpers default to destruction or drop tables. No current HTTP caller exists. Future tier enforcement is not analyzed by this finding and remains a gap under THR-027.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `schema/migrate.py:58-127` defaults safe, identifies destructive operations, and applies transactionally after a restore point. - `schema/cli.py:38-60` requires `--allow-destructive`. - `persistence/schema.py:18-73` defaults `apply_schema(... allow_destructive=True)` and exposes drop/recreate `sync_table`. - No technical restriction makes helpers test-only.

#### Preconditions and attack path

1. Trusted code, tooling, or future promotion calls a permissive helper or overrides the gate. 2. Rename/drop/reset destroys data. 3. Recovery depends on customer backup/PITR; the restore point is only a WAL marker.

#### Legitimate-user abuse case

A developer imports the simpler compatibility helper without noticing its inverted default.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: authoritative migration/CLI fail closed; apply is transactional; operations are described. - Detective: authoritative schema versions. - Recovery: transaction rollback on failure; external backup for committed destruction. - Disconfirming evidence: no HTTP caller keeps likelihood Low.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-011.
- Opus: Supported after independent re-verification.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact High and likelihood Low under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence Medium. Status Candidate — validation needed.

#### Minimal effective control objective

Make all reusable APIs safe by default, isolate reset utilities, require typed destructive authorization with actor metadata, and implement tier enforcement before promotion.

#### Verification or acceptance approach

Search callers and test every non-test entry refuses destructive plans before DDL.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Destructive helpers remain Low likelihood; operational use patterns unvalidated.

### FND-015 — FK identity enrichment discloses referenced-class content without permission

- Status: Human decision required
- Provisional severity: Medium
- Impact: Low
- Likelihood: High
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-2/SR-016
- Related Opus critiques (iteration-qualified): iteration-1/AR-002, iteration-2/AR-002, iteration-2/AR-014
- Related threats: THR-011, THR-012, THR-026
- Existing security requirements: None
- Prior acceptance or deferral: ASM-024 identifiers provisionally non-sensitive; FK inheritance was only a candidate
- Prior-decision reassessment: Conditions changed
- Human decision required: Yes

#### Consolidated claim

The v1 surface joins every projected FK—including `created_by` and `updated_by`—to the referenced table and returns display/friendly content without checking read permission on the referenced class. `incident:read` therefore yields user display names without `user:read`.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `fk_enrichment.py:56-72` adds projected FKs and audit references; lines 91-158 select target display/friendly columns and join target tables. - `user.yaml:5,17-19` makes `display-name` the user display attribute. - `records/router_factory.py:85-91,160-166` checks only the requested class. - `seed/rbac_catalog.py:19-23,137-138` gives an incident-only role and defines no user permission. - Enrichment returns display/friendly values only and cannot be used in predicates/sorts, bounding current impact.

#### Preconditions and attack path

1. Authenticate with only `incident:read`. 2. Search v1 incidents projecting `created_by`/`updated_by` and page by total. 3. Receive the referenced users' display names without user-class authorization or read audit.

#### Legitimate-user abuse case

An incident reader harvests the operator directory through normal “raised by” rendering.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: requested-class RBAC; target username/password hash are not selected; enriched values are projection-only. - Detective: None identified. - Recovery: revoke requested-class access; disclosed names cannot be recalled. - Disconfirming evidence: current reachable target content is low sensitivity; future CMDB/integration references could raise impact.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-016.
- Opus: Supported after independent re-verification.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact Low and likelihood High under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Human decision required.

#### Minimal effective control objective

Define reference-visibility semantics consistent with ASM-025. Check referenced-class/attribute authority before enriching and return the same non-existence representation used for inaccessible content, rather than leaking a distinguishable display value.

#### Verification or acceptance approach

Create a principal with source-class read only and assert fetch/search cannot distinguish or return target display/friendly content; repeat for all FK classes.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Reference-visibility semantics under ASM-025 require human/architect decision.

### FND-016 — Operator CLIs print live database and seed credentials

- Status: Supported
- Provisional severity: Medium
- Impact: Medium
- Likelihood: Medium
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-2/SR-017
- Related Opus critiques (iteration-qualified): iteration-1/AR-003, iteration-2/AR-003
- Related threats: THR-002, THR-014, THR-017
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Both operator CLIs print raw `DATABASE_URL`, including its password. Seed also prints `password_for(seed)`, which is the effective environment-supplied production password when overridden, not merely the published default.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `schema/cli.py:49-54` prints `database_url()`. - `seed/cli.py:24-39` prints `database_url()` and `password_for(seed)!r`. - `seed/users.py:75-77` returns the environment override when present. - `persistence/connection.py:13-15` returns the raw URL; no redactor or verbosity guard exists.

#### Preconditions and attack path

1. An operator correctly supplies production DB and seed secrets and runs migrate/seed. 2. Secrets enter terminal scrollback, CI logs, screen sharing, or copied diagnostics. 3. A broader log audience obtains database or admin authority, potentially composing with SR-015.

#### Legitimate-user abuse case

An operator pastes failed migration output into an incident or chat and discloses the database password.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: None. - Detective: Secret-scanning outside repository scope may notice persisted logs. - Recovery: rotate every printed credential and remove retained logs. - Disconfirming evidence: output is unconditional and no redaction helper exists.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-017.
- Opus: Supported after independent re-verification.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact Medium and likelihood Medium under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Never print secret values. Redact URL credentials and report only which environment variable/source was used.

#### Verification or acceptance approach

Run CLIs with canary secrets and assert no stdout/stderr substring contains passwords, tokens, or raw credential URLs.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

### FND-017 — The SSR process concentrates all interactive credential material

- Status: Human decision required
- Provisional severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-2/SR-018
- Related Opus critiques (iteration-qualified): iteration-1/AR-009, iteration-2/AR-009
- Related threats: THR-024, THR-028
- Existing security requirements: None
- Prior acceptance or deferral: ADR 002 / THR-024 deliberately accepts SSR concentration while keeping it visible
- Prior-decision reassessment: Still supported
- Human decision required: Yes

#### Consolidated claim

Code execution in the SSR process exposes the cookie signing secret, every access token in flight, and plaintext credentials during login, enabling session forgery and population-wide credential capture over time. The process runs as root. This is a verified blast-radius property requiring a prior compromise, not a claim that ADR 002's browser isolation choice is wrong.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `session.server.ts:20-47` stores the cookie signing secret and access token. - `api.server.ts:65-80` attaches each Bearer token; lines 46-50 discard refresh tokens. - `login.tsx:26-44` and `api.server.ts:26-37` handle plaintext login credentials. - `frontend/Dockerfile:38-47` declares no non-root `USER`. - THR-024 records the concentration as ADR 002's accepted cost; THR-028 makes it a standing input to customization-host choice.

#### Preconditions and attack path

1. An attacker gains SSR code execution or memory access, plausibly through SR-012. 2. The attacker reads the signing secret, forges sessions, observes tokens, and captures later logins. 3. If customer customization were hosted here, its author would begin inside this credential boundary.

#### Legitimate-user abuse case

None today. It becomes direct legitimate-author misuse if customer-authored code is placed in the web tier.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: tokens stay out of browser JavaScript; `.server.ts` separation; refresh token is discarded. - Detective: None identified. - Recovery: rotate session/JWT secrets and user credentials; rebuild process. - Disconfirming evidence: requires prior SSR compromise; refresh discard limits persistence.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol iteration-2 position for SR-018.
- Opus: Supported after independent re-verification. Prior trade preserved.
- Agreement: Full agreement after iteration 2.
- Disagreement: None.

#### Provisional assessment

Provisional severity Medium from impact High and likelihood Low under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Human decision required.

#### Minimal effective control objective

Keep untrusted code out of the SSR process, run non-root, minimize process secrets and outbound access, add secret rotation and integrity monitoring, and make this concentration a hard input to THR-028.

#### Verification or acceptance approach

Document/process-test secret inventory, runtime user, egress, rotation, and customization host constraints; assert no refresh persistence.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Whether concentration remains a standing constraint on THR-028 host decision (ADR 002 visibility condition).

### FND-018 — Authorized API record deletion destroys the row and its attribution with no durable event

- Status: Human decision required
- Provisional severity: Medium
- Impact: High
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): None (Opus missed-finding candidate)
- Related Opus critiques (iteration-qualified): iteration-2/AR-015
- Related threats: THR-017, THR-015, THR-020
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: Yes

#### Consolidated claim

DELETE /{locator} performs a hard DELETE that removes the record and its created_by/updated_by/timestamps together with no soft delete, tombstone, or durable product event. Likelihood is Low because no seeded non-admin role holds a delete key and there is no role-management API.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- persistence/store.py:181-190; records/router_factory.py:199-215; mapping/system_fields.py; seed/rbac_catalog.py:118-139; Opus iteration-2 AR-015.

#### Preconditions and attack path

1. Obtain admin authority (SR-001/SR-002/SR-003 paths). 2. DELETE /incidents/{locator} or /change-requests/{locator}. 3. Product retains no artefact that the record existed or was removed.

#### Legitimate-user abuse case

An admin deleting records is ordinary housekeeping; the platform cannot distinguish it from evidence destruction and records neither.

#### Existing controls and remaining gap

- Source controls summary: Preventive: delete gated on require_class_operation; seeded catalogue grants no :delete to non-admin roles. Detective: none for deletion content. Recovery: customer backups outside product.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Not examined as a separate finding; SR-009 reasons only about database authority; SR-011 likelihood rests on no HTTP caller.
- Opus: Missed-finding candidate at Medium; mechanism certain; seeded-permission bound verified.
- Agreement: No Sol contrary view (final-pass item).
- Disagreement: Not a contested Sol/Opus disagreement; open consolidation item.

#### Provisional assessment

Provisional severity Medium from impact High and likelihood Low under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Human decision required.

#### Minimal effective control objective

Emit a durable, exportable deletion event (actor, class, locator, timestamp) before row removal. Soft delete is a separate product decision, not the security minimum.

#### Verification or acceptance approach

Assert delete emits a durable event retained after row removal; assert non-admin seeded roles cannot delete; assert recovery of deletion metadata without customer backups.

#### Dependencies and sequencing

- Composes with FND for SR-009 accountability and forged-admin chains.

#### Suggested refinement targets

- Record lifecycle / deletion audit.

#### Evidence or human decision still needed

- Human product decision: durable deletion event required before production? Soft delete additionally?

### FND-019 — Shipped change-request requested-by create-default names the seeded administrator / stub actor

- Status: Supported
- Provisional severity: Low
- Impact: Medium
- Likelihood: Low
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): None (Opus missed-finding candidate)
- Related Opus critiques (iteration-qualified): iteration-2/AR-016
- Related threats: THR-015, THR-017
- Existing security requirements: None
- Prior acceptance or deferral: YAML comment records M1 scoped debt; not a security decision
- Prior-decision reassessment: Rationale undocumented
- Human decision required: No

#### Consolidated claim

change-request.requested-by ships create-default equal to SEED_ADMIN_ID / STUB_ACTOR_ID, extending THR-015 into a user-facing accountability field. Bounded today because no create form consumes it yet; created_by remains truthful.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- change-request.yaml; seed/users.py:11-12; persistence/actor.py; frontend/app/generated/field_meta.ts:50; destination_new.tsx:39-43; Opus iteration-2 AR-016.

#### Preconditions and attack path

Insider with change-request:create sets requested_by to admin UUID, or future form applies shipped default automatically.

#### Legitimate-user abuse case

Filing a change on another person's behalf is legitimate; defaulting to admin/stub makes misattribution the normal case once a form lands.

#### Existing controls and remaining gap

- Source controls summary: Preventive: no create form consumer yet; system fields excluded from write models. Detective: none for domain-field ambiguity. Recovery: none product-side.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: THR-015 covered only via non-HTTP stub path in SR-009.
- Opus: Missed-finding candidate at Low; linked to THR-015.
- Agreement: No Sol contrary view (final-pass item).
- Disagreement: None contested.

#### Provisional assessment

Provisional severity Low from impact Medium and likelihood Low under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Replace constant with current user or explicit picker; do not copy the pattern. Examine other class-definition attribution defaults.

#### Verification or acceptance approach

Assert create-default is not a stub/admin UUID; assert generated field_meta does not publish that constant for production profiles.

#### Dependencies and sequencing

- Related to SR-009 stub-actor collision.

#### Suggested refinement targets

- Class-definition attribution defaults.

#### Evidence or human decision still needed

- None beyond the YAML follow-on already anticipated.

### FND-020 — Parallel legacy and v1 record surfaces create control-drift risk

- Status: Human decision required
- Provisional severity: Informational
- Impact: Not applicable
- Likelihood: Not applicable
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-1/SR-014, iteration-2/SR-014
- Related Opus critiques (iteration-qualified): iteration-2/AR-013, iteration-2/AR-014
- Related threats: THR-026
- Existing security requirements: None
- Prior acceptance or deferral: Legacy removal tracked by issue #117; shared factory limits current auth drift
- Prior-decision reassessment: Conditions changed
- Human decision required: Yes

#### Consolidated claim

Both surfaces share current route authorization, so no authorization bypass is substantiated. They are not behaviorally identical: v1 enriches referenced records while legacy returns scalar IDs. Continued duplication creates future security-control drift and has no removal condition or parity test. Consolidation correction (AR-014): create, update and delete exist only on the legacy surface; "write routes versioned" is the concrete removal precondition for issue #117.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `records/router_factory.py:26-217` applies the same permission dependency but branches on `surface == "v1"` for enrichment. - `main.py:30-34` mounts both. - Deprecation references issue #117; no sunset condition, telemetry, or security parity test was found. - SR-016 demonstrates current projection-content divergence.

#### Preconditions and attack path

1. A future row/field/reference control is added to one branch only. 2. Clients use the less restrictive surface. 3. The duplicate becomes an authorization/disclosure bypass.

#### Legitimate-user abuse case

A client remains on the older route because a new control makes v1 fail.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: shared factory and identical class-read dependency. - Detective: OpenAPI deprecation only. - Recovery: remove legacy under issue #117. - Disconfirming evidence: current auth dependencies match; projection behavior already differs.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol Informational observation for SR-014.
- Opus: Supported on substance; parity description incomplete (AR-014); Informational recording corrected (AR-013).
- Agreement: Agreement on substance.
- Disagreement: None contested.

#### Provisional assessment

Provisional severity Informational from impact Not applicable and likelihood Not applicable under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Human decision required.

#### Minimal effective control objective

Define migration/removal conditions and run identical security matrices across both surfaces while both remain.

#### Verification or acceptance approach

Compare statuses, visibility, predicates, projection, enrichment, and future row/field rules across surfaces.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- Record removal condition for issue #117 under AGENTS.md 3.9.

### FND-021 — Demo schema, permissions, and RBAC probe ship in the production surface

- Status: Supported
- Provisional severity: Informational
- Impact: Not applicable
- Likelihood: Not applicable
- Confidence: High
- Rating elevation: None
- Provenance: Not applicable
- Related Sol findings (iteration-qualified): iteration-2/SR-019
- Related Opus critiques (iteration-qualified): iteration-1/AR-011, iteration-2/AR-011, iteration-2/AR-013
- Related threats: THR-016
- Existing security requirements: None
- Prior acceptance or deferral: None
- Prior-decision reassessment: Not applicable
- Human decision required: No

#### Consolidated claim

Demo class definitions, generated models, permissions attached to default roles, and `/auth/rbac-probe` ship without an environment gate. No present exploit is substantiated, but production attack surface and permission namespace contain development scaffolding. Recommendation caveat (AR-011/final handoff): demo-link references demo-item, so both definitions must be excluded together.

#### Affected assets, actors, and trust boundaries

- Assets: As linked in related threats in TM-REV-001.
- Actors: External attacker, insider, and operator paths per related threats.
- Trust boundaries: Per related threats in TM-REV-001.
- Components: As evidenced in source Sol/Opus records.

#### Evidence

- - `backend/class-definitions/demo-item.yaml` and `demo-link.yaml` are in the default definitions directory. - Both Dockerfiles copy all definitions and generate models; `schema/migrate.py:72-81` loads every definition. - `seed/rbac_catalog.py:19-23,118-131` creates demo-item permissions and grants them to default read roles. - `auth/routes.py:39,89-94` mounts the demo permission probe unconditionally.

#### Preconditions and attack path

1. Production uses the shipped definitions and baseline seed. 2. Demo tables/permissions and probe become part of the deployed surface. 3. Anonymous OpenAPI reveals the scaffold, signaling retained development defaults and enlarging future control scope.

#### Legitimate-user abuse case

None identified; default users merely receive unnecessary demo authority.

#### Existing controls and remaining gap

- Source controls summary: - Preventive: probe still requires permission; operator can choose another definitions directory. - Detective: OpenAPI exposes the route. - Recovery: remove demo definitions/permissions/route from production artifacts. - Disconfirming evidence: no direct data or privilege escalation path was found, so this remains Informational.
- Remaining gap: See minimal effective control objective.

#### Agent positions

- Sol: Sol Informational observation for SR-019.
- Opus: Supported on substance; Informational recording corrected (AR-013).
- Agreement: Agreement on substance.
- Disagreement: None contested.

#### Provisional assessment

Provisional severity Informational from impact Not applicable and likelihood Not applicable under TM-REV-001 section 9 (or Informational convention per AR-013). Confidence High. Status Supported.

#### Minimal effective control objective

Exclude demo definitions, generated models, seed grants, and probe routes from production artifacts through an explicit build/deployment profile.

#### Verification or acceptance approach

Generate a clean production migration/OpenAPI/permission inventory and assert no demo-prefixed object or probe exists.

#### Dependencies and sequencing

- None beyond related findings in attack chains.

#### Suggested refinement targets

- Security-design disposition; then refinement issues as selected.

#### Evidence or human decision still needed

- None

## 7. Disagreement register

| Disagreement ID | Related finding | Sol position | Opus position | Evidence for each | Provisional treatment | Required resolution |
| --- | --- | --- | --- | --- | --- | --- |
| None identified | — | — | — | All eight material iteration-1 differences resolved by evidence; four final-pass Opus items are consolidation inputs, not contested positions | Not applicable | Not applicable |

## 8. Prior accepted-risk reassessment

| Reassessment ID | Finding | Prior decision or rationale | Current evidence and security practice | Consolidated reassessment | Human review needed |
| --- | --- | --- | --- | --- | --- |
| PRA-001 | FND for SR-014 | Issue #117 legacy removal; shared factory limits auth drift | Surfaces also differ in writes (legacy-only) and v1 enrichment | Conditions changed | Yes |
| PRA-002 | FND for SR-015 | Restore-point privilege documented as operational caveat | Unconditional for non-empty plans; Compose bootstrap superuser shared with runtime | Rationale undocumented | Yes |
| PRA-003 | FND for SR-016 | ASM-024 identifiers provisionally non-sensitive; FK inheritance candidate | v1 returns referenced display content today | Conditions changed | Yes |
| PRA-004 | FND for SR-018 | ADR 002 / THR-024 accepts SSR concentration while visible | Concentration and refresh discard verified; finding keeps trade visible | Still supported | Yes |
| PRA-005 | FND for AR-016 | YAML M1 scoped debt comment | Default already shipped in field_meta; no form consumer yet | Rationale undocumented | No |
| PRA-006 | ASM-007 / FND-001/002/006 | Fail-closed secret handling intent | Web tier fails closed; API defaults signing secret and DB credentials | Rationale unsupported for API tier | No |
| PRA-007 | SR-001–SR-013 etc. | TM-REV-001 accepts no individual risk | Corrected after AR-010; no tolerance decision exists | Not applicable — no prior acceptance | No |

## 9. Diff-aware findings

Not applicable — full-review mode.

### Introduced

- None identified

### Regressions

- None identified

### Exposure changed

- None identified

### Pre-existing

- All candidates exist at the pinned commit; full-review mode does not classify change provenance.

### Provenance uncertain

- None identified

## 10. Candidate attack chains

| Chain | Component findings or threats | Combined path | Provisional risk | Evidence gap |
| --- | --- | --- | --- | --- |
| Silent-default host takeover | FND-008, FND-002, FND-011 | Anonymous schema → default DB credential → bootstrap superuser | Critical | Customer production roles unknown |
| Forged durable administrator | FND-001, FND-005, FND-007, FND-018 | Public key mints admin token → corpus drain → optional hard deletes | Critical | None for forge path |
| Log-to-database compromise | FND-016, FND-011, FND-007 | CLI prints DB password → privileged role → direct SQL | High | None |
| Undetected extraction | FND-003, FND-005, FND-015, FND-007 | Auth abuse or insider → class/FK extract without read trail | High | Load/corpus scale |
| Availability collapse | FND-003, FND-006 | Argon2 shared pool + amplified search/COUNT | High | Saturation thresholds |
| Session capture persistence | FND-004, FND-012 | Insecure transport + incomplete logout/revocation | High | Customer TLS |
| Supply-chain privileged pivot | FND-009, FND-011, FND-017 | Root package code → DB or SSR secrets | High | Advisory scan |
| Trusted-domain phishing | FND-013 | Crafted genuine-domain link + existing session | Medium | None |
| Shipped-development signal | FND-008, FND-021, FND-001, FND-002 | Demo/OpenAPI signals increase default-exploitation confidence | High | None |

## 11. Human decisions and validation needs

| Decision ID | Related finding | Decision or evidence needed | Why it matters | Recommended owner or next step |
| --- | --- | --- | --- | --- |
| HDN-001 | FND-011 | Guarantee non-superuser runtime vs restore-point design | Decides SR-002/SR-015 blast radius and SR-009 role split feasibility | Security design / Human ruling |
| HDN-002 | FND-015 | FK reference-visibility semantics under ASM-025 | Determines confidentiality control for enrichment | Security design / Human architect |
| HDN-003 | FND-004 | Whether THR-009 may be narrowed; capture SSR document headers | Evidentiary standard for amending accepted intent | Human ruling / Safe validation |
| HDN-004 | FND-017 | Concentration as standing constraint on THR-028 host decision | ADR 002 acceptance is conditional on visibility | Security design / Human ruling |
| HDN-005 | FND-018 | Durable deletion event required before production? Soft delete? | Unreconstructable authorized destruction | Security design / Human product decision |
| HDN-006 | FND-020 | Record #117 removal condition (write routes versioned) | AGENTS.md 3.9; legacy is sole write surface | Human ruling |
| HDN-007 | FND-003, FND-006 | Representative load tests for Argon2 and search amplification | Sets numeric caps and operational likelihood | Safe validation |
| HDN-008 | FND-009 | Authorized SCA/SBOM/provenance scan | May reveal present vulnerable packages | Safe validation |

## 12. Suggested security-design order

| Order | Findings | Reason to consider together |
| --- | --- | --- |
| 1 | FND-001, FND-002, FND-011, FND-016 | Silent defaults and privileged database identity |
| 2 | FND-003, FND-006 | Availability abuse of shared workers and database |
| 3 | FND-005, FND-015, FND-007, FND-018 | Authorization breadth, disclosure, and accountability/deletion |
| 4 | FND-012, FND-013, FND-004, FND-017 | Session, browser, and SSR trust-boundary hardening |
| 5 | FND-008, FND-021, FND-010, FND-009 | Exposure reduction, demo surface, disclosure, supply chain |
| 6 | FND-014, FND-020, FND-019 | Operator destruction helpers, API surface cleanup, attribution defaults |

## 13. Deduplication map

| Consolidated finding | Source keys | Merge rationale | Distinctions preserved |
| --- | --- | --- | --- |
| FND-001 | iteration-1/SR-001, iteration-2/SR-001, iteration-1/AR-012, iteration-2/AR-012 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-002 | iteration-1/SR-002, iteration-2/SR-002, iteration-1/AR-001, iteration-2/AR-001, iteration-1/AR-003, iteration-2/AR-003 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-003 | iteration-1/SR-003, iteration-2/SR-003, iteration-1/AR-004, iteration-2/AR-004 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-004 | iteration-1/SR-006, iteration-2/SR-006, iteration-1/AR-006, iteration-2/AR-006 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-005 | iteration-1/SR-007, iteration-2/SR-007, iteration-1/AR-002, iteration-2/AR-002, iteration-2/AR-014 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-006 | iteration-1/SR-008, iteration-2/SR-008, iteration-1/AR-005, iteration-2/AR-005 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-007 | iteration-1/SR-009, iteration-2/SR-009, iteration-1/AR-001, iteration-2/AR-001, iteration-1/AR-003, iteration-2/AR-003, iteration-2/AR-015, iteration-2/AR-016 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-008 | iteration-1/SR-010, iteration-2/SR-010, iteration-1/AR-011, iteration-2/AR-011 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-009 | iteration-1/SR-012, iteration-2/SR-012, iteration-1/AR-008, iteration-2/AR-008, iteration-1/AR-009, iteration-2/AR-009 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-010 | iteration-1/SR-013, iteration-2/SR-013 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-011 | iteration-2/SR-015, iteration-1/AR-001, iteration-2/AR-001, iteration-2/AR-013 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-012 | iteration-1/SR-004, iteration-2/SR-004, iteration-1/AR-012, iteration-2/AR-012 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-013 | iteration-1/SR-005, iteration-2/SR-005, iteration-1/AR-007, iteration-2/AR-007 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-014 | iteration-1/SR-011, iteration-2/SR-011, iteration-1/AR-008, iteration-2/AR-008, iteration-2/AR-015 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-015 | iteration-2/SR-016, iteration-1/AR-002, iteration-2/AR-002, iteration-2/AR-014 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-016 | iteration-2/SR-017, iteration-1/AR-003, iteration-2/AR-003 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-017 | iteration-2/SR-018, iteration-1/AR-009, iteration-2/AR-009 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-018 | iteration-2/AR-015 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-019 | iteration-2/AR-016 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-020 | iteration-1/SR-014, iteration-2/SR-014, iteration-2/AR-013, iteration-2/AR-014 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |
| FND-021 | iteration-2/SR-019, iteration-1/AR-011, iteration-2/AR-011, iteration-2/AR-013 | Same weakness/path after iteration 2 refinement | Separate where attack path or likelihood basis differs |

## 14. Source-accounting ledger

| Source key | Source report | Primary disposition | Consolidated finding or appendix entry | Rationale |
| --- | --- | --- | --- | --- |
| iteration-1/SR-001 | Sol iteration 1 | Consolidated | FND-001 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-002 | Sol iteration 1 | Consolidated | FND-002 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-003 | Sol iteration 1 | Consolidated | FND-003 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-004 | Sol iteration 1 | Consolidated | FND-012 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-005 | Sol iteration 1 | Consolidated | FND-013 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-006 | Sol iteration 1 | Consolidated | FND-004 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-007 | Sol iteration 1 | Consolidated | FND-005 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-008 | Sol iteration 1 | Consolidated | FND-006 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-009 | Sol iteration 1 | Consolidated | FND-007 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-010 | Sol iteration 1 | Consolidated | FND-008 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-011 | Sol iteration 1 | Consolidated | FND-014 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-012 | Sol iteration 1 | Consolidated | FND-009 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-013 | Sol iteration 1 | Consolidated | FND-010 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-1/SR-014 | Sol iteration 1 | Consolidated | FND-020 | Superseded by iteration-2 record of same ID; primary disposition on iteration-2 key. |
| iteration-2/SR-001 | Sol iteration 2 | Consolidated | FND-001 | Current Sol position. |
| iteration-2/SR-002 | Sol iteration 2 | Consolidated | FND-002 | Current Sol position. |
| iteration-2/SR-003 | Sol iteration 2 | Consolidated | FND-003 | Current Sol position. |
| iteration-2/SR-004 | Sol iteration 2 | Consolidated | FND-012 | Current Sol position. |
| iteration-2/SR-005 | Sol iteration 2 | Consolidated | FND-013 | Current Sol position. |
| iteration-2/SR-006 | Sol iteration 2 | Consolidated | FND-004 | Current Sol position. |
| iteration-2/SR-007 | Sol iteration 2 | Consolidated | FND-005 | Current Sol position. |
| iteration-2/SR-008 | Sol iteration 2 | Consolidated | FND-006 | Current Sol position. |
| iteration-2/SR-009 | Sol iteration 2 | Consolidated | FND-007 | Current Sol position. |
| iteration-2/SR-010 | Sol iteration 2 | Consolidated | FND-008 | Current Sol position. |
| iteration-2/SR-011 | Sol iteration 2 | Consolidated | FND-014 | Current Sol position. |
| iteration-2/SR-012 | Sol iteration 2 | Consolidated | FND-009 | Current Sol position. |
| iteration-2/SR-013 | Sol iteration 2 | Consolidated | FND-010 | Current Sol position. |
| iteration-2/SR-014 | Sol iteration 2 | Consolidated | FND-020 | Current Sol position. |
| iteration-2/SR-015 | Sol iteration 2 | Consolidated | FND-011 | Current Sol position. |
| iteration-2/SR-016 | Sol iteration 2 | Consolidated | FND-015 | Current Sol position. |
| iteration-2/SR-017 | Sol iteration 2 | Consolidated | FND-016 | Current Sol position. |
| iteration-2/SR-018 | Sol iteration 2 | Consolidated | FND-017 | Current Sol position. |
| iteration-2/SR-019 | Sol iteration 2 | Consolidated | FND-021 | Current Sol position. |
| iteration-1/AR-001 | Opus iteration 1 | Consolidated | FND-002, FND-007, FND-011 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-002 | Opus iteration 1 | Consolidated | FND-005, FND-015 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-003 | Opus iteration 1 | Consolidated | FND-002, FND-007, FND-016 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-004 | Opus iteration 1 | Consolidated | FND-003 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-005 | Opus iteration 1 | Consolidated | FND-006 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-006 | Opus iteration 1 | Consolidated | FND-004 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-007 | Opus iteration 1 | Consolidated | FND-013 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-008 | Opus iteration 1 | Consolidated | FND-009, FND-014 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-009 | Opus iteration 1 | Consolidated | FND-009, FND-017 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-010 | Opus iteration 1 | Consolidated | Accounting correction — see withdrawn/appendix and method notes | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-011 | Opus iteration 1 | Consolidated | FND-008, FND-021 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-1/AR-012 | Opus iteration 1 | Consolidated | FND-001, FND-012 | Addressed in Sol iteration 2; preserved via related findings. |
| iteration-2/AR-001 | Opus iteration 2 | Consolidated | FND-002, FND-007, FND-011 | Addressed; evidence carried in related findings. |
| iteration-2/AR-002 | Opus iteration 2 | Consolidated | FND-005, FND-015 | Addressed; evidence carried in related findings. |
| iteration-2/AR-003 | Opus iteration 2 | Consolidated | FND-002, FND-007, FND-016 | Addressed; evidence carried in related findings. |
| iteration-2/AR-004 | Opus iteration 2 | Consolidated | FND-003 | Addressed; evidence carried in related findings. |
| iteration-2/AR-005 | Opus iteration 2 | Consolidated | FND-006 | Addressed; evidence carried in related findings. |
| iteration-2/AR-006 | Opus iteration 2 | Consolidated | FND-004 | Addressed; evidence carried in related findings. |
| iteration-2/AR-007 | Opus iteration 2 | Consolidated | FND-013 | Addressed; evidence carried in related findings. |
| iteration-2/AR-008 | Opus iteration 2 | Accounting correction | Source-accounting / prior-acceptance appendix | Report-quality corrections, not standalone weaknesses. |
| iteration-2/AR-009 | Opus iteration 2 | Consolidated | FND-009, FND-017 | Addressed; evidence carried in related findings. |
| iteration-2/AR-010 | Opus iteration 2 | Accounting correction | Source-accounting / prior-acceptance appendix | Report-quality corrections, not standalone weaknesses. |
| iteration-2/AR-011 | Opus iteration 2 | Consolidated | FND-008, FND-021 | Addressed; evidence carried in related findings. |
| iteration-2/AR-012 | Opus iteration 2 | Consolidated | FND-001, FND-012 | Addressed; evidence carried in related findings. |
| iteration-2/AR-013 | Opus iteration 2 | Consolidated | FND-019, FND-020 + method note | Mechanical Informational impact/likelihood convention applied. |
| iteration-2/AR-014 | Opus iteration 2 | Consolidated | FND-020 | Parity and #117 removal-condition correction folded into finding. |
| iteration-2/AR-015 | Opus iteration 2 | Separate candidate | FND-007 | Final-pass missed-finding candidate. |
| iteration-2/AR-016 | Opus iteration 2 | Separate candidate | FND-007 | Final-pass missed-finding candidate. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-001 | Opus iteration 2 | Retained no-finding | THR-010 XSS | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-002 | Opus iteration 2 | Retained no-finding | SQL injection in search | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-003 | Opus iteration 2 | Retained no-finding | SSRF absolute fetch helper | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-004 | Opus iteration 2 | Retained no-finding (AR-014 parity correction separate) | Legacy/v1 auth bypass | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-005 | Opus iteration 2 | Withdrawn as disconfirmation | Authenticated cache control confirmed | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-006 | Opus iteration 2 | Superseded into SR-001/SR-004 | Standalone JWT required-claim finding | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-007 | Opus iteration 2 | Superseded into SR-003 | Separate login body/pool finding | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-008 | Opus iteration 2 | Superseded into SR-008 | Separate search amplification finding | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-009 | Opus iteration 2 | Coverage gaps, not findings | Customization/tier/promotion/recovery exploits | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-010 | Opus iteration 2 | Retained via SR-018 | THR-024 has finding | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-011 | Opus iteration 2 | Retained no-finding | Config-to-DDL/code injection | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/meaningful-no-finding/ROW-012 | Opus iteration 2 | Retained no-finding | Unhandled-exception disclosure | Meaningful no-finding / coverage claim audited. |
| iteration-2/adversarial-review/final-handoff/ROW-001 | Opus iteration 2 | Consolidated | Carry nineteen Sol findings | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-002 | Opus iteration 2 | Consolidated | AR-013 severity convention | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-003 | Opus iteration 2 | Consolidated | AR-014 SR-014 correction | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-004 | Opus iteration 2 | Consolidated | AR-015 missed finding | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-005 | Opus iteration 2 | Consolidated | AR-016 missed finding | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-006 | Opus iteration 2 | Consolidated | Preserve pre-existing stub/deletion/legacy items | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-007 | Opus iteration 2 | Consolidated | AR-008 residual THR-028 qualifier | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-008 | Opus iteration 2 | Consolidated | SR-019 demo-link caveat | Final-handoff item applied in this document. |
| iteration-2/adversarial-review/final-handoff/ROW-009 | Opus iteration 2 | Consolidated | Zero unresolved disagreements note | Final-handoff item applied in this document. |
| iteration-2/security-review/withdrawn/ROW-001 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Present stored XSS not substantiated | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-002 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | SQL injection withdrawn | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-003 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | SSRF not presently reachable | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-004 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Legacy/v1 auth bypass not substantiated | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-005 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Authenticated cache control confirmed withdrawn | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-006 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Standalone JWT required-claim incorporated | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-007 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Separate login body/pool incorporated | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-008 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Separate search amplification incorporated | Accounted in withdrawn appendix / no-finding claims. |
| iteration-2/security-review/withdrawn/ROW-009 | Sol iteration 2 | Withdrawn / Unsubstantiated / Superseded | Customization/tier/promotion/recovery coverage gaps | Accounted in withdrawn appendix / no-finding claims. |

## 15. Withdrawn or unsubstantiated source items

| Source item | Original concern | Disconfirming evidence or rationale | Final treatment |
| --- | --- | --- | --- |
| Present stored XSS | Free-text SSR rendering | React escaping; no dangerous sinks | Withdrawn |
| SQL injection in search | Client-controlled operators | Definition-validated names; sql.Identifier; placeholders | Withdrawn |
| SSRF via absolute fetch helper | Helper accepts absolute URLs | Production caller allowlists collection first | Unsubstantiated presently |
| Legacy/v1 authorization bypass | Dual surfaces | Shared factory identical permission dependency | Unsubstantiated; Informational drift remains |
| Authenticated cache control confirmed | Loader sets no-store | No document headers export/capture | Withdrawn as disconfirmation |
| Standalone JWT required-claim finding | Missing exp/iat | Forging capability is SR-001 precondition | Superseded |
| Separate login body/pool finding | Unbounded body/password | Same path as SR-003 | Superseded |
| Separate search amplification finding | Multiplier/COUNT/offset | Same path as SR-008 | Superseded |
| Current customization/tier/promotion/recovery exploit | Accepted forward threats | No implementation | Coverage gaps, not findings |

## 16. Meaningful no-finding claims

| Claim or threat | Sol result | Opus audit | Consolidated treatment | Residual uncertainty |
| --- | --- | --- | --- | --- |
| THR-010 stored XSS | Not substantiated | Supported | Retained no-finding | Re-review with rich text |
| SQL injection in search | Withdrawn | Supported | Retained no-finding | Resource exhaustion remains SR-008 |
| SSRF absolute fetch helper | Not presently reachable | Supported | Retained no-finding | Caller-side validation only |
| Legacy/v1 auth bypass | Not substantiated | Supported for route auth | Retained no-finding | Write asymmetry via AR-014 |
| Cache-control confirmed | Withdrawn | Supported | Retained withdrawal | Document headers still open |
| Config-to-DDL/code injection | Not claimed; examined by Opus | Supported | Retained no-finding | Re-review when external definitions loadable |
| Unhandled-exception disclosure | Not claimed; examined by Opus | Supported | Retained no-finding | Tracebacks to stdout are customer log matter |
| Unauth refresh/logout guessability | Not separately claimed | Adequate — opaque digests | Retained no-finding | None |

## 17. Next workflow step

These findings are non-governing candidates. Invoke the separate interactive `security-design` skill to:

- Resolve human decisions and accepted-risk questions.
- Select, defer, mitigate, or reject candidate recommendations.
- Create or update durable security requirements with stable IDs.
- Produce refinement handoffs for implementation issues.

Do not treat this document alone as implementation authorization.

## 18. Completion

Candidate counts:

- Supported: 11
- Supported with disagreement: 0
- Candidate — validation needed: 4
- Human decision required: 6
- Critical: 2
- High: 9
- Medium: 7
- Low: 1
- Informational: 2
- Pre-existing: 21 (full-review; all at pinned commit)
- Prior-acceptance reconsiderations: 7 (PRA-001–PRA-007)
- Unresolved disagreements: 0

Source-accounting totals:

- Sol finding records: 14 (iteration 1) + 19 (iteration 2) = 33
- Opus critique records: 12 (iteration 1) + 16 (iteration 2) = 28
- Meaningful no-finding claims: 12 keyed rows
- Final-handoff items: 9
- Prior accepted or deferred weaknesses: 7 PRA rows
- DSG records: 0
- PRA records: 7
- HDN records: 8
- Accounted source items: 91 ledger rows plus withdrawn and no-finding tables
- Unaccounted source items: 0

Completion checks:

- [x] Accepted intent, diff, and all four reports match pinned commits and hashes.
- [x] All four reports are Complete.
- [x] Every iteration-qualified SR and AR source key has exactly one primary disposition.
- [x] Every non-ID source item has a deterministic report/section/row key.
- [x] Every meaningful no-finding claim and final-handoff source key is accounted for.
- [x] Every standalone disagreement, prior-risk reassessment, and human decision has a stable DSG/PRA/HDN ID.
- [x] Every identified pre-existing weakness remains visible.
- [x] Every identified previously accepted weakness has a current reassessment.
- [x] Deduplication preserves distinct attack paths and boundaries.
- [x] Ratings follow the accepted matrix and disagreements remain explicit.
- [x] No new implementation claim was introduced during synthesis.
- [x] Candidate recommendations are minimal and verifiable.
- [x] No candidate is presented as accepted architecture intent.
- [x] Unaccounted source items equal zero.
- [x] Summary tables match authoritative detailed records.

