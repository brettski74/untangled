# Untangled ITSM Threat Model

Status: Draft
Revision: TM-REV-001
Source revision: None
Supersedes: None
Scope: Untangled ITSM platform as a single-tenant, customer self-hosted, internet-facing deployment — implemented Milestone 1 surfaces plus confirmed architectural intent
Prepared date: 2026-08-02
Accepted date: Not accepted
Accepted by: Not accepted

## 1. Executive summary

### System and scope

Untangled ITSM is an enterprise-grade IT Service Management platform intended for large corporate and government bodies. This revision models the platform as it is intended to be deployed in production: one dedicated deployment and database per customer, self-hosted by that customer's own operations team, reachable from the internet.

The implemented system today is a Milestone 1 slice — password authentication, class-wide RBAC, Incident and Change Request records with predicate search, YAML-driven schema migration, and a server-side-rendered web tier that holds the access token in an `httpOnly` cookie. Much of the platform's eventual security surface (Git-driven configuration promotion, sandboxed JavaScript customization, SSO, an administration UI, non-browser API clients, CMDB) is confirmed intent with no implementation. Those areas are modelled as forward-looking and marked as such.

Impact and likelihood are rated against the production deployment the platform must reach, not against the current pre-production state. Consequently several threats carry high ratings whose control gap is simply that the control has not been built yet. That is the intended calibration, not an alarm about the current codebase.

### Highest-priority risks

- **THR-001** and **THR-002** — the access-token signing secret silently falls back to a value published in this AGPL repository, and the seed identities ship documented default passwords tied to a fixed admin UUID. Either one, reaching production, yields full administrative access to an internet-facing deployment with no credential theft required.
- **THR-011**, **THR-012** and **THR-017** — authorization is class-wide, search allows paginated bulk projection, and nothing records reads. Any account holding a single `{class}:read` permission can drain the entire corpus without leaving a trace. Attribute-level scoping has an intended direction (**ASM-025**) that does not change this today; record-level scoping is not being designed and is what keeps this at High.
- **THR-018**, **THR-019** and **THR-027** — once configuration-as-code lands, getting a change into the customer's configuration repository confers real production authority, delayed by the release step rather than blocked by it. The planned class tiering narrows that authority deliberately, putting every authentication and authorization class beyond configuration's reach and so removing the most direct escalation path; that narrowing is why **THR-018** and **THR-020** are rated below Critical. What remains is the correctness of the tier enforcement the narrowing depends on, and customization JavaScript, whose containment is undesigned.
- **THR-003**, **THR-004** and **THR-013** — an internet-facing login path with no rate limiting or lockout, backed by deliberately expensive Argon2 hashing, plus an authenticated search operator that hands arbitrary regular expressions to PostgreSQL. Availability is a critical property here because the platform is the tool people use during outages.
- **THR-022** — self-hosted customers apply their own patches, and the vendor has no telemetry, no forced update, and no disclosure process yet. The exposure window after any advisory is unbounded.

### Material uncertainty

- Record-level authorization is not being designed (**ASM-019**). Modelling sensitive work as its own class covers sensitivity known at creation but not sensitivity discovered later, which is the security-incident reclassification case, so **THR-011** keeps a record half with no intended answer. Attribute-level scoping (**ASM-025**) is a direction rather than a design, governed by two agreed principles: no access is indistinguishable from non-existence, everywhere; and the default access stance is settable per class.
- The JavaScript customization sandbox is unresolved in both isolation model and host process (**ASM-010**, **ASM-023**, unknown **U1**). Routing all customization data access through the API removes the unauthorized-read path by design; what the choice of host decides is what untrusted code sits beside, and whether its calls carry the triggering user's authority or a service identity (**THR-028**). **THR-019** is rated on intent, not on an evaluated design.
- The class-tier model (**ASM-021**) is confirmed intent with no implementation, tracked as issue #116. The reduced impact ratings on **THR-018** and **THR-020** are credited to a control that does not exist yet, which is why **THR-027** exists as a separate entry rather than a footnote.
- Environment promotion mechanics are unresolved (**ASM-011**, unknown **U7**), so **THR-018** and **THR-020** describe an authority boundary whose controls do not yet exist to assess.
- Production TLS termination is customer infrastructure and the product has no way to assert it (**ASM-004**, unknown **U9**). **THR-023** assumes the worst realistic operator behaviour.
- No security requirements, review evidence, or penetration testing exist yet. Every "existing control" below is an observation of code, never a verification of effectiveness.

## 2. Scope

### In scope

- The Untangled ITSM application: FastAPI backend, React Router v7 server-side-rendered web tier, and PostgreSQL data store, as a single-tenant customer-hosted deployment exposed to the internet.
- Implemented Milestone 1 surfaces: authentication routes (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/rbac-probe`), RBAC enforcement, Incident and Change Request records on both the legacy unversioned and `/api/v1` surfaces, predicate search, and the SSR web tier including its session cookie.
- Operator paths that reach the data directly: the `schema migrate` and `seed` CLIs, and direct database access using `DATABASE_URL`.
- Secret handling and deployment configuration as they affect the application's security posture (environment variables, in-code defaults, Compose definitions).
- Confirmed architectural intent, explicitly marked forward-looking: enterprise SSO against a customer IdP, in-product administration UI, self-service password reset, Git-driven configuration promotion from the customer's separate configuration repository, tiered class definitions (`system`, `foundation`, `implementation`), sandboxed JavaScript customization, non-browser API clients and service accounts, the internal event bus, and CMDB.
- The third-party dependency supply chain for both the Python and JavaScript ecosystems.

### Out of scope

- Physical security and data-centre controls.
- Customer-owned infrastructure the product runs on: host operating system, network, load balancers, Kubernetes hardening, and backup infrastructure.
- The development toolchain and CI/CD pipeline that builds Untangled.
- The customer's own CI/CD arrangements for promoting configuration, including separation of merge authority from deployment authority and of test deployment from production deployment (**ASM-026**). The product cannot enforce or verify these; the threats they bear on are still modelled, but the controls belong to the customer.
- Vendor security assurance for customer forks of the core product (**ASM-022**). A fork can weaken or remove any control described here, and the vendor has no visibility into whether it has.
- Multi-tenant shared-database isolation. It is not the deployment model (**ASM-001**) and is not modelled here.
- Diff-level review of specific code changes. That is the separate security-review pipeline, which produces non-governing evidence.

### Environments and deployment contexts

| Environment or context | Relevant characteristics | Evidence |
| --- | --- | --- |
| Local development (Compose) | PostgreSQL, API and web containers with literal development secrets, plain HTTP on localhost, `UNTANGLED_COOKIE_SECURE` explicitly `false`, ports published to the host | Implementation-observed — `compose.yaml` |
| Customer production | Single tenant, one dedicated database, internet-facing, self-hosted and self-operated by the customer, containerized with Kubernetes intended for scale | Human-confirmed; Architecture — `architecture/constraints.md` deployment section |
| Promotion environments (dev, test, prod) | Configuration promoted across environments with validation and rollback; mechanics unresolved | Architecture — `architecture/unknowns.md` U7 |
| Operator workstation and CLI | Runs `schema migrate` and `seed` against `DATABASE_URL`; full DDL and DML authority outside the API | Implementation-observed — `backend/src/untangled/schema/cli.py`, `backend/src/untangled/seed/cli.py` |

### Input snapshot

| Input | Revision or reference |
| --- | --- |
| Architecture intent | `architecture/` — principles, constraints, boundaries, tradeoffs, unknowns, decisions 001 through 009 |
| Repository commit | `c14e37f` on branch `feature/108-security-pipeline` |
| Change scope or diff | None |
| Previous threat-model revision | None |

## 3. Security objectives

| Objective | Description | Priority | Evidence |
| --- | --- | --- | --- |
| Credential and token integrity | Only the legitimate holder of a credential can obtain a session, and no party can mint or forge one. Signing material must never have a usable default. | Critical | Human-confirmed; Architecture — ADR 002 |
| Least-authority record access | A principal reads and changes only the records and fields its role justifies, not every row of every class it can touch. | Critical | Human-confirmed |
| Extensible authorization | The authorization model reaches beyond class-level CRUD to attributes and to arbitrary other functionality such as dashboards, without each new surface inventing its own scheme. | High | Human-confirmed |
| Prompt authorization change | A change to a principal's effective authority takes effect promptly, without waiting out a token lifetime. This is a property the current design has and any future design must keep. | High | Human-confirmed |
| Accountability and non-repudiation | Every consequential action, including reads of sensitive content, is durably attributable to a specific principal and resists tampering. | Critical | Human-confirmed — enterprise and government audit expectation |
| Service availability during incidents | The platform stays usable precisely when the customer is handling a major outage; no unauthenticated or low-privilege request can degrade it. | Critical | Human-confirmed |
| Confidentiality of infrastructure intelligence | Topology, hostnames, versions and vulnerability detail do not reach parties who would use them to attack the customer. | High | Human-confirmed |
| Configuration authority integrity | Changing platform behaviour requires deliberate, reviewable, attributable authority, whether the path is the UI, Git, or the CLI. | High | Human-confirmed; Architecture — configuration-is-code invariant |
| Protection of personal data | Personal data held in accounts and free-text narratives is protected commensurate with its sensitivity, though it is not the highest-value target. | Medium | Human-confirmed |
| Safe extensibility | Customer-authored customization cannot compromise the platform, other customers' data, or the host. | High | Architecture — `architecture/principles.md` invariant 6 |
| Fail-closed configuration | A misconfigured deployment refuses to serve rather than serving insecurely. | High | Architecture — ADR 002 clause 5 |

## 4. Assets

| ID | Asset | Security properties | Sensitivity or business impact | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| AST-001 | User account directory and credential material — usernames, display names, Argon2id password hashes | Confidentiality / Integrity / Privacy | Compromise yields authenticated access; hashes enable offline attack against reused passwords | Implementation-observed — `backend/class-definitions/user.yaml`, `auth/passwords.py` | Active |
| AST-002 | Session credentials — access JWTs, opaque refresh tokens and their stored digests, the web-tier session cookie | Confidentiality / Integrity | Possession is impersonation for the token's lifetime | Implementation-observed — `auth/tokens.py`, `frontend/app/auth/session.server.ts` | Active |
| AST-003 | Cryptographic secrets — the HS256 JWT signing secret and the cookie signing secret | Confidentiality / Integrity | Disclosure permits forging any identity; loss of integrity invalidates all sessions | Implementation-observed — `auth/settings.py`, `frontend/app/auth/session.server.ts` | Active |
| AST-004 | Operational record content — incidents and change requests including free-text narratives that carry personal data | Confidentiality / Integrity / Privacy / Auditability | Business-sensitive operational history; narratives routinely name people and describe account problems | Implementation-observed — `backend/class-definitions/incident.yaml`, `change-request.yaml`; Human-confirmed sensitivity | Active |
| AST-005 | Infrastructure and configuration-item data — topology, hostnames, software versions, known vulnerabilities | Confidentiality / Integrity | Highest-value target per the human authority; a map for attacking the customer's estate | Human-confirmed; Architecture — CMDB in product scope | Active |
| AST-006 | RBAC policy data — roles, permissions, and their assignments, later extended with child-role hierarchy and attribute-level role requirements | Integrity / Auditability | Tampering is direct privilege escalation across the whole platform | Implementation-observed — `rbac/store.py`, `backend/class-definitions/role.yaml` and related; Human-confirmed for the extensions (ASM-025) | Active |
| AST-007 | Platform configuration as code — the customer's separate configuration repository, its class definitions, UI configuration, and promotion artifacts | Integrity / Availability / Auditability | Defines extension schema and behaviour, derived into DDL. Authority is bounded by class tier: `system` definitions are core-owned and not configurable, `foundation` definitions accept additive extension only, `implementation` classes are wholly configuration-owned | Architecture — configuration-is-code invariant; Human-confirmed tiering (ASM-021); Implementation-observed for current class definitions | Active |
| AST-008 | Customer-authored customization logic — JavaScript and YAML written by or for the customer | Confidentiality / Integrity | Confidential commercial logic the licensing boundary exists to protect; also an execution surface | Architecture — `architecture/constraints.md` licensing boundary | Active |
| AST-009 | Audit and accountability trail — currently `created_by`, `updated_by` and timestamps; a durable trail is required | Integrity / Auditability | Without it, neither detection nor forensic reconstruction is possible | Implementation-observed — `mapping/system_fields.py`; Human-confirmed requirement | Active |
| AST-010 | The PostgreSQL database and its access credentials | Confidentiality / Integrity / Availability | Direct access bypasses every application control | Implementation-observed — `persistence/connection.py` | Active |
| AST-011 | Platform availability | Availability | The customer's incident-management capability; unavailability compounds whatever outage they are already handling | Human-confirmed | Active |
| AST-012 | Integration and discovery credentials — accounts and keys the platform will hold to reach customer systems | Confidentiality / Integrity | Forward-looking; once held, the platform becomes a high-value pivot into the estate | Human-confirmed as future CMDB-phase data; Assumption on timing | Active |

## 5. Actors

| ID | Actor | Capabilities and access | Security expectations | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| ACT-001 | Unauthenticated internet user | Reaches the web tier's login route and every unauthenticated API surface, including `/`, `/health`, `/docs`, `/redoc` and `/openapi.json` | Can obtain nothing beyond a liveness signal and a login attempt | Implementation-observed — `backend/src/untangled/main.py`; Human-confirmed exposure | Active |
| ACT-002 | Low-privilege operator | Holds a single class read permission, for example `incident:read`; can fetch and search every record of that class | Sees only what the role justifies | Implementation-observed — `rbac/dependencies.py`, `seed/rbac_catalog.py` | Active |
| ACT-003 | Read-write operator | Create, read and update on granted classes; no delete, no admin | Changes are attributable and bounded by role | Implementation-observed — `seed/users.py` | Active |
| ACT-004 | Platform administrator | Holds the `admin` allow-all permission; unrestricted across every class and operation | Highly privileged, strongly audited, rarely used | Implementation-observed — `rbac/keys.py` | Active |
| ACT-005 | Customer infrastructure operator | Owns the host, containers, environment variables, database, and backups; runs `schema migrate` and `seed`; can read or alter anything | Trusted by necessity; actions must still be attributable | Human-confirmed; Implementation-observed CLI paths | Active |
| ACT-006 | Configuration author with merge rights | Commits and merges in the customer's separate configuration repository; changes reach production through promotion. Bounded by class tier and by the customization sandbox, not by platform RBAC | Change is reviewed, attributable, and confined to the tiers configuration is permitted to touch | Human-confirmed (ASM-013, ASM-021); Architecture — U6, U7 | Active |
| ACT-007 | Customization developer | Authors sandboxed JavaScript that executes inside the platform with access to platform data | Code is contained, observable, and cannot compromise the host | Architecture — `architecture/principles.md` invariant 6; forward-looking | Active |
| ACT-008 | Web-tier service identity | The SSR process; holds the session signing secret and attaches Bearer tokens for every authenticated browser request | Acts strictly on behalf of the requesting user | Implementation-observed — `frontend/app/auth/api.server.ts`; Architecture — ADR 002 | Active |
| ACT-009 | Non-browser API client or integration | Authenticates to the API with Bearer directly; no service-account identity model exists today | Distinct, revocable, least-privilege machine identity | Architecture — ADR 002 consequences; Human-confirmed as forward-looking | Active |
| ACT-010 | Customer identity provider | Asserts user identity through SAML or OIDC; carries MFA and password policy | Assertions are validated; IdP compromise is a modelled dependency | Human-confirmed as intended | Active |
| ACT-011 | Opportunistic external attacker | Internet-wide scanning, credential stuffing against exposed login, exploitation of published vulnerabilities in unpatched deployments | Gains nothing without a valid credential | Human-confirmed exposure; Assumption on attacker behaviour | Active |
| ACT-012 | Targeted external attacker | Motivated by the customer's infrastructure intelligence or by disrupting incident response; will chain modest weaknesses; may target the supply chain | Cannot reach infrastructure data or degrade availability | Human-confirmed sensitivity and sector; Assumption on capability | Active |
| ACT-013 | Malicious or compromised insider | Legitimate credentials and legitimate access; may act within granted permissions to exfiltrate or to destroy attribution | Actions are bounded, recorded, and non-repudiable | Human-confirmed audit requirement | Active |
| ACT-014 | Upstream dependency or package-registry actor | Publishes a compromised Python or JavaScript package that a build consumes | Dependency changes are deliberate and reviewable | Human-confirmed as in scope; Implementation-observed lockfiles | Active |
| ACT-015 | Core-product fork maintainer | Maintains a customer fork of the core product and can alter any core behaviour, including class-tier enforcement, authentication and RBAC | Divergence is deliberate, reviewed, and kept current with upstream security fixes | Human-confirmed (ASM-022) | Out of scope |

## 6. Trust boundaries and data flows

| ID | Boundary or flow | From / to | Data and protocol | Trust change | Existing controls | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TB-001 | Internet to web tier | Browser to SSR app | HTML, form posts, session cookie over HTTP or HTTPS | Untrusted to application-trusted | Session gate redirects unauthenticated requests; `safe_next_path` constrains redirect targets | Implementation-observed — `frontend/app/auth/gate.server.ts`, `next_path.ts` | Active |
| TB-002 | Web tier to user agent | SSR app to browser cookie jar | Signed `httpOnly` session cookie containing the access JWT | Server secret to client custody | `httpOnly`, `sameSite=lax`, path scoping, secret-signed, `maxAge` derived from the token's own `exp` | Implementation-observed — `frontend/app/auth/session.server.ts`; Architecture — ADR 002 | Active |
| TB-003 | Web tier to API | SSR process to FastAPI | `Authorization: Bearer <JWT>` over in-network HTTP | Service-trusted to service-trusted | Bearer validated per request; 401 clears the session, 403 preserves it | Implementation-observed — `frontend/app/auth/api.server.ts` | Active |
| TB-004 | Unauthenticated to authenticated API | Any client to `/auth/*`, `/`, `/health`, `/docs`, `/openapi.json` | Credentials in, tokens out; API schema out | Untrusted to identified | Argon2id verification, generic failure message, refresh digests stored hashed with atomic single-claim rotation | Implementation-observed — `auth/routes.py`, `auth/store.py` | Active |
| TB-005 | Authenticated to authorized | Identified principal to a record operation | Permission key check per route | Identified to permitted | `require_class_operation` on every record route; permissions resolved from the database per request, so revocation is immediate | Implementation-observed — `rbac/dependencies.py`, `records/router_factory.py` | Active |
| TB-006 | API to database | FastAPI to PostgreSQL | SQL over `DATABASE_URL` | Application to data store | All predicates parameterized through `psycopg.sql` composition; identifiers never string-interpolated from client input | Implementation-observed — `persistence/search.py` | Active |
| TB-007 | Operator CLI and direct database access | Operator workstation to PostgreSQL | DDL and DML outside the application | Bypasses application trust entirely | None in the application; relies wholly on operator discipline | Implementation-observed — `schema/cli.py`, `seed/cli.py`; Human-confirmed in scope | Active |
| TB-008 | Process environment to secrets | Host or orchestrator to application process | `UNTANGLED_JWT_SECRET`, `UNTANGLED_SESSION_SECRET`, `DATABASE_URL` | Deployment configuration to running trust anchor | Web tier refuses to build session storage without a secret; API and database URL both fall back to in-code defaults | Implementation-observed — `auth/settings.py`, `persistence/connection.py`, `frontend/app/auth/session.server.ts` | Active |
| TB-009 | Configuration repository to running platform | Customer's separate configuration repository to deployed configuration | Tiered YAML class definitions, UI configuration, eventually customization logic | Development-time authority to production behaviour, bounded by class tier | None built; class tiering is the intended boundary control | Architecture — U6, U7; Human-confirmed separation and tiering (ASM-013, ASM-021) | Active |
| TB-010 | Customization runtime to platform host | Customer JavaScript to a curated set of exposed functions | Host bridge calls, API calls, outbound requests | Untrusted code inside a platform process, expected to be outside the API process and to reach data only by calling the API as the triggering user | None built; isolation model and host process both undecided (THR-028) | Architecture — U1; Human-confirmed (ASM-023); forward-looking | Active |
| TB-011 | Dependency supply chain to deployed system | PyPI and npm to build artifacts | Package code executing with full application privilege | Third party to production trust | `requirements.lock` and `package-lock.json` pin resolved versions | Implementation-observed; Human-confirmed in scope | Active |
| TB-012 | Identity provider to platform | Customer IdP to Untangled | SAML or OIDC assertions | External identity to platform principal | None built | Human-confirmed as intended; forward-looking | Active |
| TB-013 | Platform to external systems | Untangled to discovery targets and integrations | Outbound credentials and collected data | Platform to customer estate | None built | Human-confirmed as future CMDB-phase | Active |
| TB-014 | Core product source to deployed system | Vendor release, or a customer fork of it, to the running platform | Application code including class-tier enforcement, authentication and RBAC | Vendor-assured to customer-modified when forked | Vendor releases and lockfiles | Human-confirmed (ASM-022) | Out of scope for the fork case; the stock-release path is covered by THR-021 |

## 7. Data classification and lifecycle

| Data class | Examples | Collection or creation | Storage | Transit | Retention, export, and deletion | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Credential material | Password hashes, refresh-token digests | Set at seed or by an administrator; refresh digests on login | PostgreSQL; Argon2id for passwords, SHA-256 digest for refresh tokens | Plaintext password crosses TB-001 and TB-004 in a form post | Refresh rows retain revoked entries indefinitely; no pruning observed | Implementation-observed — `auth/store.py` |
| Session credentials | Access JWT, session cookie | Minted on login | Browser cookie jar only; JWTs are not persisted server-side | Cookie on TB-002, Bearer header on TB-003 | Cookie expires with the token's `exp`; no server-side revocation exists | Implementation-observed; Architecture — ADR 002 |
| Cryptographic secrets | JWT signing secret, cookie signing secret | Supplied by the customer's secret manager as environment variables | Process environment | Never transmitted | No rotation capability; deferred to issue #67 | Human-confirmed; Architecture — ADR 002 |
| Personal data | Usernames, display names, names and contact detail inside ticket narratives | Administrator creation and operator free-text entry | PostgreSQL, TOAST for large text | HTTPS assumed but not asserted by the product | Customer is the data controller and owns erasure; product provides no erasure capability | Human-confirmed |
| Operational record content | Incident and change-request fields and narratives | Operator entry through the SSR web tier | PostgreSQL | TB-001 through TB-006 | Customer-owned; no product retention policy | Implementation-observed |
| Infrastructure intelligence | Hostnames, topology, versions, vulnerabilities | Today incidental in narratives; later CMDB and discovery | PostgreSQL | Same path as record content | Customer-owned | Human-confirmed; forward-looking for CMDB |
| Configuration as code | Tiered YAML class definitions, UI configuration | Authored by configuration authors in a repository separate from core product code | Configuration repository and the deployed filesystem; derived into DDL within tier limits | Git transport, then promotion | Git history is the retention model; deletion is a rewrite | Architecture; Human-confirmed separation and tiering; Implementation-observed for current class definitions |
| Audit data | `created_by`, `updated_by`, `created_at`, `updated_at` | Written by the application on every record write | Columns on each record table | Not exported | No separate retention, no export, no tamper evidence | Implementation-observed — `mapping/system_fields.py` |
| Identifiers | UUIDv7 primary keys, friendly-ids such as `INC0001234` | Generated on record creation | Columns on each record table; appear in URLs, logs, and API payloads | Every boundary | No restriction; treated as non-sensitive | Human-confirmed (ASM-024) |

## 8. Assumptions and constraints

Evidence marked Human-confirmed means the architect stated it, not that it has been vetted. For forward-looking design intent in particular, the human has been explicit that these are working ideas that have not been assessed for security implications and are expected to change if analysis finds them unsound. Ratings that depend on such intent are therefore provisional, and this model treats stated intent as something to test rather than as a settled control.

| ID | Assumption or constraint | Evidence | Confidence | Consequence if false | Validation owner or path | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ASM-001 | Deployments are single-tenant: one dedicated instance and database per customer | Human-confirmed | High | A shared-database model would add a whole class of tenant-isolation threats absent from this revision | Human architect | Open |
| ASM-002 | Production deployments are internet-facing | Human-confirmed | High | Intranet-only exposure would lower likelihood on THR-003, THR-004 and THR-016 | Human architect | Open |
| ASM-003 | The customer self-hosts and holds all production infrastructure, database, secret and backup access; the vendor has no production access | Human-confirmed | High | Vendor-hosted deployments would add vendor operators as a privileged actor and a cross-customer blast radius | Human architect | Open |
| ASM-004 | TLS termination is customer-owned infrastructure; the product cannot assert that HTTPS is in use | Architecture — U9; Assumption | Medium | If the product terminates TLS itself, THR-023 becomes a product defect rather than a deployment dependency | Unknown U9 | Open |
| ASM-005 | Enterprise SSO will carry MFA and password policy; local login stays enabled as break-glass administrative access. Self-service password recovery does not apply to SSO accounts, and is required wherever local accounts exist | Human-confirmed | High | If local login is disabled after SSO lands, THR-003 and THR-025 shrink to the break-glass path only | Human architect | Open |
| ASM-006 | Rate limiting and lockout belong in the product rather than being delegated to a reverse proxy, and are tracked as issue #33 | Human-confirmed | High | Scope and defaults are undetermined, so a partial implementation covering login but not the wider API would leave THR-004 and THR-013 untouched | Issue #33; security design | Open |
| ASM-007 | Secrets are supplied as environment variables from the customer's own secret manager, and the product fails closed when they are absent | Human-confirmed | High | The API does not currently fail closed on a missing JWT secret, so this assumption is violated by the implementation today — see THR-001 | Security design | Open |
| ASM-008 | The customer is the data controller and owns retention, export and erasure | Human-confirmed | High | A product obligation to support erasure requests would add data-lifecycle threats not modelled here | Human architect | Open |
| ASM-009 | The vendor publishes advisories and releases; customers are responsible for applying them | Human-confirmed | High | No disclosure process exists yet, so the assumption describes intent rather than current capability — see THR-022 | Security design | Open |
| ASM-010 | The JavaScript customization sandbox isolation model is undecided | Architecture — U1 | High | THR-019 cannot be rated against a real design until this closes | Unknown U1 | Open |
| ASM-011 | Environment promotion mechanics are undecided | Architecture — U7 | High | THR-018 and THR-020 describe an authority boundary whose controls do not exist to assess | Unknown U7 | Open |
| ASM-012 | The internal event bus shape is undecided | Architecture — U2 | Medium | An external broker would add a trust boundary and message-integrity threats not modelled here | Unknown U2 | Open |
| ASM-013 | Configuration lives in a separate, customer-owned repository, independent of core product code; merge rights there confer authority over configuration only | Human-confirmed | High | If configuration shared a repository with core code, merge rights would confer authority over the entire product and THR-018 would return to Critical | Unknown U6 | Open |
| ASM-014 | Non-browser API clients are forward-looking; no service-account identity model exists today | Human-confirmed | High | If integrations arrive using human accounts, attribution and least-privilege both degrade | Security design | Open |
| ASM-015 | A durable, tamper-evident, SIEM-exportable audit trail is a requirement | Human-confirmed | High | A lower bar would reduce THR-017 substantially | Human architect | Open |
| ASM-016 | Availability is a critical security property because the platform is used during outages | Human-confirmed | High | A lower availability bar would drop THR-004 and THR-013 by one level | Human architect | Open |
| ASM-017 | Ratings are calibrated to a production internet-facing deployment, not to the current pre-production Milestone 1 state | Human-confirmed | High | Rating against current state would lower many likelihoods and mask work that must happen before launch | Human architect | Open |
| ASM-018 | The dependency supply chain is in scope; physical security, customer infrastructure and the vendor's own CI/CD are out of scope | Human-confirmed | High | Bringing CI/CD in scope would add build-integrity threats that materially affect THR-021 | Human architect | Open |
| ASM-019 | Field-level authorization has an intended direction (ASM-025). Record-level authorization is not currently being designed: any principal holding a class read permission reads every row of that class. Some motivating cases are instead expected to be met by modelling sensitive work as its own class — HR matters as a distinct class rather than as incidents — with ordinary class-level permissions restricting it. The human expects some form of record-level control will eventually be needed | Implementation-observed; Human-confirmed | Medium | Modelling by class does not cover records whose sensitivity is discovered rather than known at creation, which is the security-incident reclassification case | Human architect | Open |
| ASM-020 | The published AGPL repository makes every in-code default value known to attackers | Implementation-observed; Assumption | High | A closed-source distribution would reduce THR-001 and THR-002 likelihood, though defaults would still be weak | Human architect | Open |
| ASM-021 | Class definitions are tiered. `system` classes are core-owned and reject every configuration change with a hard failure, up to refusing to start; every class related to authentication or authorization is `system`, which covers `user`, `role`, `permission`, `role_permission`, `user_role` and `refresh_token`. `foundation` classes such as `incident` and `change-request` accept additive configuration extension only. `implementation` classes exist only in configuration. The leading candidate for tier identity is an enforced `i_*` prefix on every configuration-authored class and attribute name, reserving the unprefixed namespace to core; whether that is the sole mechanism is deliberately deferred. Tracked as issue #116, not yet implemented | Human-confirmed | High | Without enforced tiering, configuration merge rights reach RBAC and core schema again, restoring THR-018 and THR-020 to Critical | Issue #116; security design; see THR-027 | Open |
| ASM-022 | Customers may run stock vendor releases or maintain their own fork of the core product. Security assurance for forks is out of scope for this model: a fork can weaken or remove any control described here, and the vendor has no visibility into whether it has | Human-confirmed | High | None for this model, which reasons about the stock product. A customer running a fork inherits responsibility for every control it diverges from | Out of scope | Closed |
| ASM-023 | Customization is JavaScript only, exposed to a curated set of functions that must respect all relevant security controls, and reaches data only by calling the API. It is expected to run outside the API process — in the web tier, the browser, or a separate process yet to exist — none of which may hold database credentials or reach the database directly, and all of which need constrained network and filesystem access. Customization calls carry no more authority than the user on whose behalf they run. Data must not pass between user identities, with any exception individually justified, controlled, and security-reviewed at the point it is introduced | Human-confirmed as expectation, sandbox undesigned | Medium | If customer code ever runs inside the API process, HTTP-edge enforcement stops being the data boundary. If a customization host calls the API under a service identity, the enforcement passes and means nothing — see THR-028 | Unknown U1; security design | Open |
| ASM-024 | UUID and friendly-id values are provisionally non-sensitive. The human has since qualified this as possibly premature, with one candidate refinement being that foreign-key attributes inherit view permission from the class they reference | Human-confirmed, explicitly provisional | Medium | UUIDv7 embeds a creation timestamp and friendly-ids are near-sequential, so both leak record creation time and aggregate volume even for records the caller cannot read. If that inference matters to a customer, identifiers stop being non-sensitive | Human architect, at attribute-level authorization implementation | Open |
| ASM-026 | Configuration follows a trunk-based workflow: changes merge to the default branch, and a release is later cut and deployed to a downstream environment. Separating merge authority from deployment authority, and test deployment from production deployment, is the customer's CI/CD responsibility and outside this product's scope | Human-confirmed | High | If a customer wires merge directly to production deployment, the delay and detection interval THR-018's likelihood credits disappears | Customer CI/CD; out of scope for this model | Open |
| ASM-025 | Authorization is intended to extend beyond class-level CRUD, along these lines: a role may contain child roles granted recursively; attributes carry optional YAML metadata naming the roles required to view or update them; and enforcement is API-only, so direct database access bypasses it. Two governing characteristics apply to any such design. Lack of access is indistinguishable from non-existence, consistently across every surface — search, fetch, write validation, and anything else that describes or returns a class. And the default access stance is settable per class, defaulting to allow, so that sensitive classes can be set to default-deny; `system` classes defaulting to deny is under consideration | Human-confirmed as direction, explicitly not vetted | Medium | A global default-allow with no per-class override would make every newly added attribute readable by everyone until someone restricted it. Recursive child roles need cycle detection, a warning on excessive nesting depth, and a bounded resolution cost | Security design; likely an ADR | Open |

Do not hide unresolved design decisions in prose. Record them here as explicit assumptions or constraints.

## 9. Risk-rating method

### Impact

- `Critical`: System-wide compromise, catastrophic or regulated-data exposure, unrecoverable integrity loss, or prolonged loss of a critical service.
- `High`: Major unauthorized access, sensitive-data exposure, material integrity loss, or sustained service disruption.
- `Medium`: Limited-scope compromise or disruption with bounded impact and practical recovery.
- `Low`: Minor exposure or disruption with little business impact and straightforward recovery.

### Likelihood

- `High`: Expected or readily repeatable with realistic attacker access and few preconditions.
- `Medium`: Plausible with meaningful prerequisites, timing, access, or attacker effort.
- `Low`: Requires uncommon access, difficult conditions, or a fragile chain of events.

### Overall priority

| Impact \ Likelihood | High | Medium | Low |
| --- | --- | --- | --- |
| Critical | Critical | High | High |
| High | High | High | Medium |
| Medium | High | Medium | Low |
| Low | Medium | Low | Low |

Elevate a matrix result only when threat chaining, blast radius, irreversibility, or material uncertainty justifies it; record the reason.

## 10. Threat catalogue

### THR-001 — Hardcoded signing-secret fallback permits access-token forgery

- Status: Active
- STRIDE categories: Spoofing, Elevation of privilege
- Related assets: AST-003, AST-002, AST-001, AST-004, AST-005, AST-006
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-004, TB-008
- Preconditions: The deployment starts without `UNTANGLED_JWT_SECRET` set, or with the published Compose value copied forward.
- Attack path: `jwt_secret()` returns the literal `local-dev-only-change-me-untangled-jwt-secret` when the environment variable is absent, and the API starts normally with no warning. That value is published in this AGPL repository and repeated in `compose.yaml`. An attacker who suspects the default mints an HS256 token with `typ` set to `access` and `sub` set to any user UUID — and the seed administrator's UUID is itself a published constant in `seed/users.py`. `decode_access_token` validates the signature against the same default and returns the subject, `fetch_user_by_id` finds an active admin, and RBAC grants everything. No credential is ever stolen and no login occurs. The web tier's session secret is not affected, because `require_session_secret()` throws when absent, but the attacker does not need the web tier: the API is the target.
- Legitimate-user abuse case: An operator with repository read access, which is everyone, can test the default against a production endpoint without any insider privilege.
- Existing controls: The web tier fails closed on its own missing secret. Access tokens are short-lived, which is irrelevant when the attacker can mint fresh ones.
- Control gaps: No startup assertion that a signing secret was supplied; no rejection of the known default value; no key rotation or key identifier in the token header; a single symmetric secret shared by every issuer and verifier. The intended move from HS256 to ES256, likely under issue #67, would narrow the last of these usefully: with an asymmetric scheme only the issuer holds signing capability, so a verifier compromise stops being a forgery capability. It does not address the fallback itself, which is the substance of this threat.
- Impact: Critical
- Impact justification: Full administrative authority over every record, every configuration surface and every user in an internet-facing deployment, with no credential compromise and no bound on duration.
- Likelihood: High
- Likelihood justification: The failure is silent, the default is published, misconfiguration is a routine operational event, and the whole attack is a single scripted request. OWASP A05 Security Misconfiguration and A02 Cryptographic Failures both describe exactly this pattern; NIST SP 800-57 treats default keying material as unusable.
- Overall priority: Critical
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/auth/settings.py` lines 15 to 20, `compose.yaml` line 28, `backend/src/untangled/seed/users.py` line 12; Architecture — ADR 002 clause 5 establishes fail-closed as intent for the web tier.
- Security objectives: Credential and token integrity; Fail-closed configuration.
- Uncertainty or disagreement: None on the threat itself. The human confirmed (ASM-007) that fail-closed secret handling is the intended posture, which the API does not currently implement. The algorithm change to ES256 is intent, not schedule, and this threat is rated against HS256 as implemented.
- Supersedes: None

### THR-002 — Documented default credentials reach a production deployment

- Status: Active
- STRIDE categories: Spoofing, Elevation of privilege
- Related assets: AST-001, AST-010, AST-004, AST-005, AST-006
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-004, TB-006, TB-008
- Preconditions: A production deployment is seeded without overriding the seed password environment variables, or the database is exposed with the default `DATABASE_URL` credentials.
- Attack path: `seed/users.py` defines five principals with published default passwords, including `admin` with `admin-change-me` holding the allow-all permission. `password_for()` uses the default whenever the corresponding environment variable is unset, and seeding is a deliberate operator step with no production guard. Separately, `persistence/connection.py` defaults to `postgresql://untangled:untangled@127.0.0.1:5432/untangled`, and `compose.yaml` publishes port 5432 to the host. An attacker logs in as `admin` at `/auth/login` and receives a valid token pair, or connects to an exposed database directly.
- Legitimate-user abuse case: A junior operator seeds a production environment to "get it working", intending to change passwords later, and the credentials outlive the intention.
- Existing controls: Every default password ends in `-change-me`, and each is overridable through a documented environment variable. The seed step is deliberate rather than automatic on bring-up.
- Control gaps: No refusal to seed with defaults outside development; no forced password change on first login; no detection or reporting of accounts still holding a seed default; no warning that database credentials are defaulted.
- Impact: Critical
- Impact justification: The `admin` seed principal holds allow-all authority, so this is complete platform compromise; the database default is complete data compromise bypassing the application entirely.
- Likelihood: High
- Likelihood justification: Default-credential exposure is among the most consistently exploited weaknesses on internet-facing systems, and both the usernames and the passwords are published in this repository. It requires an operator omission rather than any attacker skill.
- Overall priority: Critical
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/seed/users.py` lines 31 to 77, `backend/src/untangled/persistence/connection.py` line 10, `compose.yaml` lines 6 to 11 and 31 to 32.
- Security objectives: Credential and token integrity; Fail-closed configuration.
- Uncertainty or disagreement: Whether the seed CLI is intended to be reachable in production at all is unresolved; the human confirmed operator CLI paths are in scope (see THR-014).
- Supersedes: None

### THR-003 — Unthrottled credential brute force and stuffing against local login

- Status: Active
- STRIDE categories: Spoofing
- Related assets: AST-001, AST-002, AST-004, AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004
- Preconditions: The login endpoint is reachable from the internet, which ASM-002 confirms.
- Attack path: `/auth/login` accepts unlimited attempts. There is no per-account lockout, no per-source-address throttle, no proof-of-work or CAPTCHA, no MFA, and no notification of repeated failures. An attacker runs a credential-stuffing list against known usernames — and usernames are enumerable, see THR-005 — or brute-forces the small set of seeded accounts. The web tier's login action forwards attempts straight through, so the SSR route provides no additional friction. Success yields a full token pair.
- Legitimate-user abuse case: An insider grinds a colleague's password offline-style through the live endpoint without tripping any control.
- Existing controls: Argon2id with library defaults raises the cost of each guess considerably. The failure response is a generic "Invalid username or password". Inactive users cannot authenticate.
- Control gaps: No rate limiting, lockout, MFA, anomaly detection, or authentication-event logging at any layer of the product.
- Impact: High
- Impact justification: A single compromised operator account yields access to every record of every class that account's roles cover, which under class-wide RBAC is substantial.
- Likelihood: High
- Likelihood justification: Automated credential stuffing against exposed login endpoints is continuous background activity on the internet. OWASP A07 Identification and Authentication Failures names absent brute-force protection explicitly; NIST SP 800-63B requires rate limiting on verifiers.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/auth/routes.py` lines 42 to 52, `frontend/app/routes/login.tsx` action; repository-wide search finds no rate-limiting code. Human-confirmed — ASM-006.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: The human has confirmed rate limiting belongs in the product rather than in a mandated reverse proxy, and it is tracked as issue #33. What remains open is its scope: covering login alone would leave THR-004 and THR-013 untouched.
- Supersedes: None

### THR-004 — Unauthenticated computational exhaustion through the password-hashing path

- Status: Active
- STRIDE categories: Denial of service
- Related assets: AST-011
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-004
- Preconditions: Internet-reachable login endpoint and a valid username, though an invalid one still consumes a request slot and a database round trip.
- Attack path: Argon2id is memory-hard and CPU-intensive by design — that is the point of it. `PasswordHasher()` uses library defaults, and every login attempt with a known-valid username triggers a full verification. An unauthenticated attacker issues concurrent login requests to saturate CPU and memory on the API tier. Because the same process serves all authenticated traffic, operators lose the platform. Each attempt also opens a fresh database connection through `get_db`, since there is no pooling, adding connection pressure. This is the mirror image of THR-003: the control that makes guessing expensive also makes the endpoint expensive to serve.
- Legitimate-user abuse case: None meaningful; this is an unauthenticated attack.
- Existing controls: None specific. Container orchestration might restart a wedged process, which is recovery, not prevention.
- Control gaps: No rate limiting, no concurrency cap on the hashing path, no request queueing or shedding, no connection pooling, no resource isolation between the authentication path and the rest of the API.
- Impact: High
- Impact justification: Availability is a critical property (ASM-016) because the platform is the customer's incident-management tool; losing it during a major outage compounds the outage being managed.
- Likelihood: Medium
- Likelihood justification: Trivial to execute and requires no credentials, but a competent deployment behind a load balancer with generic rate limiting would blunt it, and the attack is noisy.
- Overall priority: High
- Confidence: Medium
- Evidence: Implementation-observed — `backend/src/untangled/auth/passwords.py` line 8, `backend/src/untangled/auth/dependencies.py` lines 21 to 27.
- Security objectives: Service availability during incidents.
- Uncertainty or disagreement: Untested. Actual capacity is unknown without load measurement, so the likelihood rating is inferred rather than demonstrated.
- Supersedes: None

### THR-005 — Username enumeration through login behaviour differences

- Status: Active
- STRIDE categories: Information disclosure
- Related assets: AST-001
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-004
- Preconditions: Internet-reachable login endpoint.
- Attack path: `authenticate_user` returns immediately when the username is unknown or the account is inactive, without performing any password verification. When the username exists and is active, the request performs a full Argon2id verification costing orders of magnitude more time. The response body and status are identical, but the timing is not, and the difference is large enough to be measurable across the network rather than requiring statistical care. An attacker maps valid accounts, then targets them with THR-003.
- Legitimate-user abuse case: Not applicable.
- Existing controls: A single generic error message and a uniform 401 status for all failure modes.
- Control gaps: No dummy verification against a fixed hash for unknown or inactive users; no response-time normalisation; no logging of enumeration patterns.
- Impact: Low
- Impact justification: Discloses which accounts exist. On its own this is reconnaissance, not compromise.
- Likelihood: Medium
- Likelihood justification: Easy to exploit and reliable given the size of the timing gap, but it yields only a precursor. Note that seeded usernames are published anyway, which lowers the practical value against default installations.
- Overall priority: Low
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/auth/store.py` lines 55 to 62.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-006 — Stolen access tokens stay valid until expiry with no revocation path

- Status: Active
- STRIDE categories: Spoofing, Elevation of privilege
- Related assets: AST-002
- Relevant actors: ACT-011, ACT-012, ACT-013
- Trust boundaries: TB-002, TB-003, TB-004
- Preconditions: An attacker obtains an access JWT or the session cookie carrying it, through THR-023, THR-009, a shared workstation, or endpoint compromise.
- Attack path: Access tokens are stateless JWTs with no `jti`, no server-side registry and no denylist. `/auth/logout` revokes the presented refresh token only; the access token continues to validate until its `exp`. A user who logs out on a compromised machine, or an administrator who responds to a suspected compromise, has no way to terminate an active session. The default lifetime is fifteen minutes, but it is operator-configurable through `UNTANGLED_ACCESS_TOKEN_TTL_SECONDS` with no upper bound, so a deployment that sets a long TTL for convenience widens this arbitrarily.
- Legitimate-user abuse case: A departing employee's session outlives their offboarding by the token lifetime.
- Existing controls: Short default TTL. The user's `is_active` flag is checked from the database on every request, so account deactivation does take effect immediately. Permissions are also resolved from the database per request, so permission revocation propagates immediately — this is genuinely better than the typical claims-in-token design and directly addresses one of ADR 002's deferred concerns.
- Control gaps: No token identifier, no denylist, no per-user token version or generation counter, no upper bound on the configurable TTL, no administrative "sign out everywhere". The access token carries only `sub`, `iat`, `exp` and `typ`, so it holds no authorization claims — which is precisely why permission propagation is currently immediate and why this threat is bounded to session continuation rather than stale authority.
- Impact: Medium
- Impact justification: Bounded by the token lifetime and materially reduced by immediate deactivation and permission propagation, but within that window the attacker acts fully as the user.
- Likelihood: Medium
- Likelihood justification: Requires prior token capture, which needs its own foothold, but the number of plausible capture paths is not small.
- Overall priority: Medium
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/auth/tokens.py` lines 27 to 32 for the full claim set, `auth/routes.py` lines 68 to 71, `auth/dependencies.py` lines 48 to 51, `rbac/dependencies.py` lines 21 to 26; Architecture — ADR 002 deferred list, issue #67.
- Security objectives: Credential and token integrity; Accountability and non-repudiation; Prompt authorization change.
- Intended direction: Provisional and unimplemented — a UUIDv7 `jti` on each access token with a revocation list, held in PostgreSQL initially and moved to Redis only if measurement shows it is needed. The token is to remain free of authorization claims, so revocation covers session termination while authority continues to resolve per request. Signing is also intended to move from HS256 to ES256, likely under issue #67.
- Uncertainty or disagreement: ADR 002 records the JWT versus opaque-session question as genuinely open; this threat does not presuppose the answer. The Medium rating depends on today's per-request database resolution of permissions, which is what keeps this a session-continuation problem rather than a stale-authority one, and it is why the prompt-authorization-change objective is recorded as a property to preserve rather than one to build.
- Supersedes: None

### THR-007 — Refresh-token theft with no rotation-reuse detection

- Status: Active
- STRIDE categories: Spoofing
- Related assets: AST-002, AST-001
- Relevant actors: ACT-011, ACT-013, ACT-009
- Trust boundaries: TB-004
- Preconditions: An attacker obtains a plaintext refresh token from a non-browser API client, since the web tier discards refresh tokens at login.
- Attack path: `rotate_refresh_token` claims a token atomically and issues a new pair, which correctly prevents two parties both claiming the same token. But when the stolen token is replayed after the legitimate holder has already rotated, the request simply fails; nothing concludes that a theft occurred. If the attacker rotates first, the attacker holds the live chain and the legitimate client's next refresh fails silently, which the client experiences as an ordinary expiry. Either way the attacker sustains access for up to the seven-day refresh lifetime, and no alert is raised because there is no authentication event log. Revoked rows accumulate with no pruning, so the family is reconstructable in principle but nothing reconstructs it.
- Legitimate-user abuse case: A shared integration credential passed between teams is retained by someone who has left the team.
- Existing controls: Tokens are 32 bytes from `secrets.token_urlsafe`, stored only as SHA-256 digests, expiry-checked in the claiming statement, and rotated atomically. Rotation itself is well built.
- Control gaps: No token-family lineage, no reuse detection, no family-wide invalidation on reuse, no authentication event log, no binding of the token to a client or address.
- Impact: High
- Impact justification: Seven days of sustained, renewable access as the victim, refreshing indefinitely if the attacker keeps rotating.
- Likelihood: Low
- Likelihood justification: The web tier never retains a refresh token (ADR 002 and `api.server.ts` discard it explicitly), and no non-browser client exists yet (ASM-014), so today there is barely anywhere to steal one from. This rises once integrations land.
- Overall priority: Medium
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/auth/store.py` lines 74 to 105 and 138 to 160, `frontend/app/auth/api.server.ts` lines 46 to 50.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: None. Note that OAuth 2.0 Security Best Current Practice (RFC 9700) requires either sender-constrained refresh tokens or reuse detection; only rotation is present.
- Supersedes: None

### THR-008 — Login cross-site request forgery places a victim in an attacker's session

- Status: Active
- STRIDE categories: Spoofing, Tampering
- Related assets: AST-004, AST-005
- Relevant actors: ACT-012
- Trust boundaries: TB-001, TB-002
- Preconditions: The victim visits an attacker-controlled page while using a browser that can reach the deployment.
- Attack path: The login form posts username and password with no CSRF token. `sameSite=lax` protects authenticated actions because those carry the session cookie, but the login POST needs no cookie to succeed, so the attribute does not apply — ADR 002 identifies precisely this gap. An attacker's page auto-submits a cross-origin form containing credentials for an account the attacker controls. The victim's browser receives a session cookie for that account and, believing they are signed in normally, proceeds to enter infrastructure detail or incident narratives into records the attacker can read.
- Legitimate-user abuse case: Not applicable.
- Existing controls: `sameSite=lax` on the session cookie limits what a cross-site context can do afterwards. `safe_next_path` prevents the `next` parameter from redirecting off-site.
- Control gaps: No CSRF token, no origin or referer check on the login action, no re-authentication prompt when a session appears without a prior login interaction.
- Impact: Medium
- Impact justification: The victim's subsequent work lands in attacker-controlled records. Serious where operators paste infrastructure detail, but confined to what the victim does after the forced login, and the deception is fragile once the victim notices the wrong display name.
- Likelihood: Low
- Likelihood justification: Requires luring an operator to a hostile page and requires them not to notice they are signed in as someone else.
- Overall priority: Low
- Confidence: High
- Evidence: Implementation-observed — `frontend/app/routes/login.tsx` lines 26 to 54, `frontend/app/auth/session.server.ts` line 41; Architecture — ADR 002 deferred list names login CSRF explicitly.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: None; ADR 002 already carries this to issue #67.
- Supersedes: None

### THR-009 — Missing response headers and cache controls on authenticated pages

- Status: Active
- STRIDE categories: Information disclosure, Tampering
- Related assets: AST-004, AST-005, AST-002
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-002
- Preconditions: Authenticated SSR responses traverse any shared cache, or the victim's browser renders attacker-influenced content.
- Attack path: A repository-wide search finds no Content-Security-Policy, no Strict-Transport-Security, no X-Frame-Options or frame-ancestors, no X-Content-Type-Options, and no `Cache-Control: private, no-store` on authenticated responses. Three consequences follow. A shared forward proxy or CDN may store and later serve SSR-rendered pages containing another operator's incident content. The absence of framing controls permits clickjacking of state-changing SSR actions. And the absence of CSP removes the layer that would contain a script injection, whether from THR-010, a compromised dependency (THR-021), or customization code (THR-019).
- Legitimate-user abuse case: Not applicable.
- Existing controls: The `httpOnly` cookie keeps the token itself out of any script's reach, which is a real and deliberate mitigation (ADR 002).
- Control gaps: All of the headers named above, applied systemically rather than per route. ADR 002 explicitly leaves "whether `Cache-Control: private, no-store` should be systemic" unresolved.
- Impact: Medium
- Impact justification: Alone this leaks cached content and permits clickjacking; its greater significance is removing the containment layer for more serious threats.
- Likelihood: Medium
- Likelihood justification: Cache exposure depends on the customer's network path, which the product cannot see. Clickjacking requires luring an authenticated operator.
- Overall priority: Medium
- Confidence: High
- Evidence: Implementation-observed — repository-wide search for `Content-Security-Policy`, `X-Frame-Options`, `Cache-Control` returns matches only in ADR 002 and unrelated test files; Architecture — ADR 002 deferred list.
- Security objectives: Confidentiality of infrastructure intelligence; Protection of personal data.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-010 — Stored script injection abuses the server-side session

- Status: Active
- STRIDE categories: Tampering, Elevation of privilege
- Related assets: AST-004, AST-005, AST-006
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-001, TB-002
- Preconditions: A rendering path that emits operator-supplied content without escaping, or a future rich-text or Markdown field.
- Attack path: An operator stores markup in a free-text field. If any surface renders it unescaped, the script runs in another operator's authenticated context. Because the access token is `httpOnly`, the script cannot steal the credential — but it does not need to. ADR 002's own design means SSR resource routes and actions attach the Bearer token server-side, so injected script can drive authenticated state-changing requests as the victim, including record modification and, if the victim is an administrator, RBAC changes. With no CSP (THR-009) nothing constrains where the script may exfiltrate to.
- Legitimate-user abuse case: A low-privilege operator who can create an incident plants content that executes when an administrator views the queue, performing privileged actions the attacker cannot perform directly. This is the classic privilege-escalation-by-content pattern and it works precisely because everyone reads everyone's records under class-wide RBAC (THR-011).
- Existing controls: React escapes interpolated content by default, and a repository-wide search finds no `dangerouslySetInnerHTML` anywhere in the frontend. This is currently a strong control.
- Control gaps: No CSP; no output-encoding policy documented for future rendering surfaces; no sanitisation layer for the rich-text or Markdown fields an ITSM product will inevitably want; no plan for how customization-rendered content (forward-looking) is escaped.
- Impact: High
- Impact justification: Privileged actions performed as an administrator, with no credential theft required and no audit trail distinguishing them from legitimate work.
- Likelihood: Low
- Likelihood justification: The default escaping genuinely holds today. The rating reflects the near-certainty that rich text arrives later, not a present defect.
- Overall priority: Medium
- Confidence: Medium
- Evidence: Implementation-observed — repository-wide search for `dangerouslySetInnerHTML` returns nothing; `frontend/app/detail/detail_form.tsx`, `frontend/app/list/basic_list.tsx`; Architecture — ADR 002 clause 2.
- Security objectives: Least-authority record access; Safe extensibility.
- Uncertainty or disagreement: Rated on anticipated rather than current rendering surfaces; if rich text is never introduced, this drops to Low.
- Supersedes: None

### THR-011 — Class-wide permissions expose every record and every field

- Status: Active
- STRIDE categories: Information disclosure, Elevation of privilege
- Related assets: AST-004, AST-005, AST-012
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005
- Preconditions: The principal holds any read permission for the class.
- Attack path: Authorization resolves to `{class}:{operation}` keys, checked once per route by `require_class_operation`. There is no record-level predicate, no ownership or team scoping, no confidentiality marking, and no field-level restriction. A user granted `incident:read` so they can work their own queue can read every incident in the system, including a security incident describing an active breach and its remediation, the incident recording an HR investigation, and every field of every record. The same holds for update and delete on classes where those are granted. Nothing in the search or fetch path narrows rows by principal — `execute_search` compiles only the client's predicate, and `fetch_by_locator` applies no ownership filter.
- Legitimate-user abuse case: This is the abuse case. Every action described is within granted permissions and indistinguishable from legitimate work, which is exactly why it is dangerous in an enterprise or government setting where confidential incidents are routine.
- Existing controls: RBAC is enforced consistently on every record route, with permissions resolved from the database per request. The enforcement that exists is sound; its granularity is the problem.
- Control gaps: No record-level authorization and none designed; no field-level authorization implemented, though one is now intended (ASM-025); no confidentiality classification on records, no team or assignment scoping, no read auditing to at least detect the access (THR-017).
- Characteristics required of the intended attribute-level control: These are requirements for a feature that does not exist, not gaps in one that does. Lack of access must be indistinguishable from non-existence everywhere, which specifically includes the query surface and not only the projection — the search compiler accepts a predicate or sort key on any mapped attribute, so a restriction applied only where data is serialized would leave `eq`, `gt`, `lt`, `starts-with` and `regexp` able to recover a restricted value from which rows return, and `total` able to answer even when no rows do. Applying the equivalence rule at attribute resolution, where the compiler already validates names against the class definition, covers projection, predicates, sort keys, and counts in one place. On write, rejecting an unviewable attribute as unknown must be indistinguishable from a genuine typo by status, message and timing. The default access stance must be settable per class (ASM-025). Knowledge that an attribute exists is a much weaker exposure than access to its contents, and the population who can see class configuration is small in practice, so consistency across schema-describing surfaces such as generated models is a design consideration rather than a control failure.
- Impact: High
- Impact justification: Complete exposure of a class's contents to any holder of one permission, including material that enterprise and government customers expect to be compartmented.
- Likelihood: High
- Likelihood justification: No attack is needed; the exposure exists by construction for every account. Any account compromise inherits the full class.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/rbac/keys.py`, `rbac/dependencies.py`, `records/router_factory.py` lines 85 to 175, `persistence/search.py` `execute_search`; Human-confirmed sensitivity of infrastructure data.
- Security objectives: Least-authority record access; Confidentiality of infrastructure intelligence.
- Uncertainty or disagreement: This threat splits into a field half and a record half. The field half has an intended direction (ASM-025) whose required characteristics are recorded above; it does not change the current rating, because nothing is built. The record half is what keeps this at High: any principal with a class read permission still reads every row. The human is not currently designing record-level authorization and notes that some of its motivating cases are better served by modelling — HR matters as their own class rather than as incidents, restricted by ordinary class-level permissions. That works where the sensitivity is known at creation. It does not cover the case the human identifies as genuinely hard: an incident that begins as routine and is reclassified as a security incident after triage, by which time it has already been readable by everyone holding `incident:read`, and moving it to another class does not retract those reads. Reclassification-after-exposure is the case that will eventually force a record-level answer.
- Supersedes: None

### THR-012 — Bulk exfiltration through the search API

- Status: Active
- STRIDE categories: Information disclosure
- Related assets: AST-004, AST-005, AST-012
- Relevant actors: ACT-002, ACT-003, ACT-013, ACT-011
- Trust boundaries: TB-005, TB-006
- Preconditions: A single valid credential holding one class read permission, obtained legitimately or through THR-001, THR-002 or THR-003.
- Attack path: `POST /api/v1/{class}/search` accepts an arbitrary attribute projection, a predicate, a sort, and `limit` with `offset`. The caller requests every attribute, supplies no predicate so the compiled `WHERE` is literally `TRUE`, and pages through the class two hundred rows at a time using the returned `total`. Sorting is stabilised on `created_at` and `id`, so pagination is reliable and nothing is missed. Nothing throttles request rate, nothing caps cumulative rows per principal per period, and nothing records that a read occurred. For a mature deployment this drains the entire incident history and, once CMDB lands, the customer's infrastructure map — the asset the human identified as the highest-value target.
- Legitimate-user abuse case: Indistinguishable from an operator running a broad report. That is the core problem: the platform cannot tell a leaving employee copying the estate from someone building a dashboard.
- Existing controls: `limit` is capped at 200 per request; predicate nesting is bounded at depth 3 and 50 predicates per list; RBAC gates the endpoint.
- Control gaps: No per-principal volume budget, no rate limiting, no export or bulk-read detection, no read audit trail, no anomaly alerting, no data-loss controls of any kind.
- Impact: High
- Impact justification: Wholesale loss of the customer's operational and, prospectively, infrastructure intelligence.
- Likelihood: High
- Likelihood justification: A short script and one ordinary credential. The per-request cap slows it trivially, not meaningfully — a hundred thousand records is five hundred requests.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/persistence/search.py` lines 26 to 30 and 148 to 259, `records/router_factory.py` lines 77 to 135.
- Security objectives: Confidentiality of infrastructure intelligence; Accountability and non-repudiation; Least-authority record access.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-013 — Database resource exhaustion through unbounded pattern search

- Status: Active
- STRIDE categories: Denial of service
- Related assets: AST-011, AST-010
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005, TB-006
- Preconditions: Any authenticated principal with one class read permission.
- Attack path: The `regexp` operator passes a client-supplied pattern directly into PostgreSQL's `~` operator against a chosen column. PostgreSQL's regular-expression engine backtracks, so a catastrophic pattern applied to long `multiline-text` content burns CPU inside the shared database — the one component the whole deployment depends on. There is no `statement_timeout` set anywhere in the codebase, so a pathological query runs until it finishes or the connection dies. Separately, `contains` and `ends-with` compile to leading-wildcard `LIKE`, which cannot use a standard index and forces a sequential scan of the class on every call. An attacker issues these concurrently; because `get_db` opens a new connection per request with no pooling, connection slots exhaust as well. Legitimate operators lose the platform.
- Legitimate-user abuse case: An operator innocently searching for a substring across a large incident table produces the same load. The code comments already flag pattern filters on long text as performance debt; this threat is that debt reachable by any authenticated user, deliberately.
- Existing controls: Result `limit` is capped at 200, which bounds rows returned but not work performed. Predicate nesting and list length are bounded. Invalid regular expressions are caught and reclassified as a semantic error with a rollback.
- Control gaps: No `statement_timeout`, no query cost estimation or rejection, no regex complexity or length limit, no per-principal query-rate limiting, no connection pooling, no read-replica separation, no circuit breaker.
- Impact: High
- Impact justification: Loss of the incident-management platform during the periods it matters most, and the database is shared by every function of the product.
- Likelihood: Medium
- Likelihood justification: Requires an authenticated account, which is a real prerequisite, but the technique needs no privilege beyond read and no sophistication beyond a known catastrophic pattern. See OWASP's Regular Expression Denial of Service guidance.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/persistence/search.py` lines 568 to 584 and 26 to 30, comment at lines 56 to 58; repository-wide search for `statement_timeout` returns nothing; `auth/dependencies.py` lines 21 to 27.
- Security objectives: Service availability during incidents.
- Uncertainty or disagreement: The human considers `regexp` worth keeping, so the answer has to be mitigation rather than removal. Candidates raised are a cost analysis using `EXPLAIN`, static analysis of the pattern, and gating the operator itself behind access control so that only trusted roles can use it. None is implemented or chosen, so this rating assumes the operator as it stands today.
- Supersedes: None

### THR-014 — Operator CLI and direct database access bypass authorization and audit

- Status: Active
- STRIDE categories: Tampering, Repudiation, Elevation of privilege, Information disclosure
- Related assets: AST-010, AST-004, AST-005, AST-006, AST-009, AST-001
- Relevant actors: ACT-005, ACT-013
- Trust boundaries: TB-007
- Preconditions: Possession of `DATABASE_URL` or shell access to a host that has it.
- Attack path: `schema migrate` and the seed CLI connect straight to PostgreSQL with full DDL and DML authority. Nothing in this path consults RBAC, nothing produces an application-level record of what was done, and nothing distinguishes a legitimate migration from an operator reading every password hash, granting themselves the `admin` permission by inserting a `user_role` row, or altering incident content to conceal an action. The human confirmed these are real privileged paths into production data, not development-only conveniences. Because the customer self-hosts (ASM-003), the operator population and the security-administrator population are frequently the same people.
- Legitimate-user abuse case: An infrastructure operator with a legitimate need to fix a stuck record edits it in `psql` instead of through the API, leaving `updated_by` pointing at whoever last touched it through the application.
- Existing controls: Schema apply is deliberate rather than automatic on Compose bring-up, which the tradeoffs document records as an intentional choice. Schema version history is recorded in the database.
- Control gaps: No separation between application database credentials and administrative ones, no least-privilege database roles, no database-level audit extension, no application-visible record of out-of-band change, no detection of RBAC rows changing outside the API. Note that the class-tier model (ASM-021) bounds the configuration path only; direct operator DDL is unconstrained by it and can alter `system` classes freely. Attribute-level authorization (ASM-025) is likewise API-only by design, so this path reads restricted attributes without restriction — an accepted consequence, recorded so it is not later mistaken for a defect in the attribute model.
- Impact: High
- Impact justification: Complete, unattributable control over all data and all access policy.
- Likelihood: Medium
- Likelihood justification: Requires infrastructure access, which is a genuine barrier to outsiders but routine for the insider population, and it is the natural pivot for any host compromise.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/schema/cli.py`, `seed/cli.py`, `persistence/connection.py`; Human-confirmed in scope.
- Security objectives: Accountability and non-repudiation; Configuration authority integrity.
- Uncertainty or disagreement: Whether production schema change should eventually route exclusively through the Git configuration engine is unresolved (ASM-011).
- Supersedes: None

### THR-015 — Stub actor identity collides with the seeded administrator, corrupting attribution

- Status: Active
- STRIDE categories: Repudiation
- Related assets: AST-009, AST-004
- Relevant actors: ACT-005, ACT-013
- Trust boundaries: TB-007
- Preconditions: Any write performed outside an HTTP request context.
- Attack path: `SEED_ADMIN_ID = STUB_ACTOR_ID`, so the placeholder actor used for non-HTTP writes is the same UUID as the real `admin` principal. Every seeded, migrated or batch-written row is stamped `created_by` and `updated_by` pointing at the administrator account. The audit fields cannot distinguish "the admin did this" from "a background process did this", which means an administrator can plausibly repudiate any action by attributing it to automation, and an investigator reconstructing an incident cannot tell the two apart. The comment in `seed/users.py` explains the collision was chosen for foreign-key safety, which is a reasonable engineering motive with an accountability cost that was probably not the point of the decision.
- Legitimate-user abuse case: An administrator performing an unauthorised change relies on the ambiguity if questioned.
- Existing controls: The collision is deliberate and documented in the code, so it is at least known.
- Control gaps: No distinct non-human principal for system writes, no actor-type discriminator on records, no separate provenance field recording which channel produced a write.
- Impact: Medium
- Impact justification: Undermines attribution on the administrative account specifically, which is the account whose actions most need attribution. Bounded because the underlying data is still correct.
- Likelihood: Medium
- Likelihood justification: The condition is structural and permanent; exploitation requires an insider choosing to rely on it.
- Overall priority: Medium
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/seed/users.py` lines 11 to 12, `persistence/actor.py`; Architecture — `architecture/boundaries.md` notes non-HTTP paths may use an aligned stub actor.
- Security objectives: Accountability and non-repudiation.
- Uncertainty or disagreement: None. Composes with THR-014 and THR-017.
- Supersedes: None

### THR-016 — Unauthenticated surface exceeds the permitted health check and publishes the full API schema

- Status: Active
- STRIDE categories: Information disclosure
- Related assets: AST-004, AST-005
- Relevant actors: ACT-001, ACT-011, ACT-012
- Trust boundaries: TB-004
- Preconditions: Internet-reachable API.
- Attack path: `constraints.md` permits exactly one unauthenticated endpoint, a health check returning only a running flag and nothing else. The implementation exceeds that in three ways. `/` returns a service identifier, fingerprinting the product and version family for an attacker enumerating hosts. `/health` returns a status object rather than a bare flag. And most significantly, the `FastAPI()` constructor is called without `docs_url`, `redoc_url` or `openapi_url` overrides, so `/docs`, `/redoc` and `/openapi.json` are all served to anonymous callers. That schema enumerates every route on both the legacy and v1 surfaces, every request and response model, every field name and type of every class, the permission-bearing structure of the API, and the descriptions naming the deprecation issue. An attacker gets a complete map of the attack surface before authenticating, and, combined with THR-001, knows exactly which endpoints to hit with a forged token. Verbose validation errors on authenticated routes leak comparable internal detail, though by then the schema is already public.
- Legitimate-user abuse case: Not applicable.
- Existing controls: None. The Swagger UI is deliberately convenient for development, and the tradeoffs document notes that `/docs` must obtain credentials to call endpoints — but reading the schema requires none.
- Control gaps: No production configuration disabling or authenticating the documentation routes; no reduction of `/` and `/health` to the permitted minimum; no environment-aware application configuration at all.
- Impact: Medium
- Impact justification: Reconnaissance rather than compromise, but unusually complete reconnaissance, and it violates a confirmed architectural constraint.
- Likelihood: High
- Likelihood justification: Requires a single unauthenticated GET; automated scanners check these paths by default.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/main.py` lines 18 to 46, repository-wide search for `docs_url` and `openapi_url` returns nothing; Architecture — `architecture/constraints.md` authentication section.
- Security objectives: Confidentiality of infrastructure intelligence; Fail-closed configuration.
- Uncertainty or disagreement: None on the divergence itself. The human considers both remedies prudent — disabling the documentation routes outside development and requiring authentication for them — and neither is implemented, so the rating stands against the current open state.
- Supersedes: None

### THR-017 — Audit coverage cannot detect or reconstruct malicious activity

- Status: Active
- STRIDE categories: Repudiation, Information disclosure
- Related assets: AST-009, AST-004, AST-005, AST-006
- Relevant actors: ACT-013, ACT-004, ACT-005, ACT-012
- Trust boundaries: TB-005, TB-007
- Preconditions: None. This is a standing condition of the platform.
- Attack path: The only audit artifacts are `created_by`, `updated_by`, `created_at` and `updated_at` columns on each record. There is no record of reads, so THR-012's bulk exfiltration leaves nothing behind. There is no authentication event log, so THR-003's brute force and THR-007's refresh-token theft are invisible. There is no field-level change history, so an attacker who alters an incident's content leaves only a timestamp and a name — and can overwrite that with a subsequent legitimate-looking edit. There is no record of permission or role changes, so privilege escalation through THR-014 is undetectable. Nothing is tamper-evident, and anyone with database access (ACT-005) can rewrite the audit columns themselves. Nothing is exportable to a SIEM, so the customer's existing detection capability cannot see the platform at all.
- Legitimate-user abuse case: An insider takes an action, then relies on the absence of evidence. The platform provides no way to contradict them.
- Existing controls: Audit identity on writes is a confirmed cross-cutting requirement and HTTP handlers do use the authenticated current user, so write attribution exists at a basic level.
- Control gaps: No read logging, no authentication event log, no authorization-decision log, no field-level history, no permission-change log, no tamper evidence, no retention policy, no SIEM export, and the write attribution that does exist is compromised by THR-015.
- Impact: High
- Impact justification: The human confirmed enterprise and government grade auditability as a requirement. Its absence means no detection, no forensics, no non-repudiation, and likely no compliance acceptance.
- Likelihood: High
- Likelihood justification: Every other threat in this catalogue is harder to detect and harder to investigate because of this. It is not a possibility but a present condition.
- Overall priority: High
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/mapping/system_fields.py`, repository-wide search for logging and audit facilities returns nothing; Human-confirmed requirement (ASM-015); Architecture — `architecture/boundaries.md` audit identity on writes.
- Security objectives: Accountability and non-repudiation.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-018 — Merge rights on customer configuration confer bounded production authority

- Status: Active
- STRIDE categories: Tampering, Elevation of privilege, Repudiation
- Related assets: AST-007, AST-004, AST-011
- Relevant actors: ACT-006, ACT-012, ACT-013
- Trust boundaries: TB-009
- Preconditions: The Git-driven configuration engine exists (forward-looking) and the customer holds a configuration repository separate from core product code.
- Attack path: Whoever can get a change into the configuration repository changes what the deployed platform eventually does, without authenticating to the platform, without passing any RBAC check, and without appearing in any platform audit trail. The attacker path is the developer's Git credential, a CI token with push rights, or a persuasive pull request in a repository whose reviewers are not thinking about security. The workflow is trunk-based, so there is no merge directly into production: a change lands on the default branch, and a release is later cut from it and deployed to a downstream environment. That sequencing matters. It puts at least one further step and one further credential between the merge and production, ideally distinct credentials for merge, test deployment and production deployment, and it creates an interval in which the change is visible in the trunk. It is a delay and a detection opportunity rather than a barrier, because an unnoticed change rides the next release out regardless — but the attacker needs the release to happen and needs nobody to look, rather than simply needing merge rights. Two design decisions bound how far that reach goes. Configuration lives in its own repository, so merge rights there do not touch core product code (ASM-013). And class definitions are tiered (ASM-021), so `system` classes reject configuration change outright — and every authentication and authorization class is `system`, which closes the "grant myself admin by editing YAML" path that would otherwise be the whole threat. What remains is still substantial: creating `implementation` classes, additively extending `foundation` classes, changing UI configuration, and shipping customization logic that executes in-process (THR-019). Note also that permission keys are derived from class names, so creating an implementation class mints new permission keys — configuration therefore defines the permission namespace even though it cannot assign permissions within it.
- Legitimate-user abuse case: A configuration author adds an implementation class that captures data the platform was never meant to hold, or extends a foundation class with an attribute that quietly duplicates sensitive content into a surface with different visibility, bundled into forty lines of legitimate field changes on a busy day.
- Existing controls: None built. The tier model and repository separation are the intended structural controls and neither exists yet. Git provides history and, if the customer configures it, branch protection, review, and separation between merge and deployment credentials — customer CI/CD controls that the product neither requires nor verifies, and which the human places outside this product's scope (ASM-026).
- Control gaps: No product-enforced review or approval, no signature or provenance verification on promoted configuration, no platform-side audit of what a promotion changed, no rollback guarantee, no validation gate, and no enforcement yet of the tier boundary the reduced rating depends on. Separation of merge from deployment authority is the customer's to arrange, so the product cannot assume it holds.
- Impact: High
- Impact justification: Durable, unattributable control over the platform's extension surface and behaviour. Reduced from Critical because the tier model puts identity and access-policy schema out of reach, and repository separation puts core code out of reach.
- Likelihood: Medium
- Likelihood justification: The capability does not exist yet; once built, the attack needs ordinary developer-credential compromise, which is common, plus the change surviving until the next release is cut. Where a customer separates merge from deployment authority the second step is a real obstacle, but the product cannot rely on it.
- Overall priority: High
- Confidence: Medium
- Evidence: Architecture — configuration-is-code invariant in `architecture/principles.md`, unknowns U6 and U7; Human-confirmed repository separation and class tiering (ASM-013, ASM-021).
- Security objectives: Configuration authority integrity; Accountability and non-repudiation.
- Uncertainty or disagreement: The impact reduction is credited to controls that do not exist yet. Tier membership is now settled — the human has confirmed that every authentication and authorization class is `system` — but the enforcement mechanism is deliberately deferred. If that enforcement is not built, is incorrect, or can be evaded (THR-027), this returns to Critical. ASM-011 and U6 must also close before the promotion path itself can be assessed.
- Supersedes: None

### THR-019 — Sandbox escape or covert exfiltration by customization JavaScript

- Status: Active
- STRIDE categories: Elevation of privilege, Information disclosure, Denial of service
- Related assets: AST-008, AST-004, AST-005, AST-010, AST-011
- Relevant actors: ACT-007, ACT-013, ACT-014
- Trust boundaries: TB-010
- Preconditions: The customization runtime exists (forward-looking).
- Attack path: Customer-authored JavaScript is intended to run for event handlers, workflow logic and data transformations, against a curated set of exposed functions, reaching data only by calling the API (ASM-023). Because the API authorizes every call against the requesting user, a customization cannot read what its user cannot read — the unauthorized-access half of this threat is answered by design rather than by sandbox policy, provided the host presents the user's identity and not a service identity (THR-028). Three problems survive the model working exactly as intended. First, escape from whatever isolation is chosen: the isolation model is undecided (ASM-010) and host bridges are historically where escapes occur, though the consequence depends heavily on the host — escaping into a process that holds database credentials is a different event from escaping into one that holds none. Second, exfiltration of *authorized* data: nothing in the model stops a handler collecting what its user may legitimately see and sending it elsewhere, and a server-side host with outbound network access is a considerably better exfiltration position than a browser session. Third, resource exhaustion: an unbounded loop or allocation in a handler on a hot event path degrades the platform, and availability is critical here. A fourth question is unresolved rather than survived — which identity a handler runs as when no user triggered it. A scheduled escalation or a queued event has no current user, and the answer determines whether the permission model applies to that execution at all.
- Legitimate-user abuse case: A contractor writing a customization for one purpose adds a quiet secondary behaviour. Because the customization is confidential commercial logic the licensing boundary deliberately protects (AST-008), nobody at the vendor reviews it, and the customer may lack anyone who reads it critically.
- Existing controls: None built. Safe extensibility is a confirmed architectural invariant requiring customizations to be sandboxed, versioned, observable and fail-safe, which is intent rather than mechanism.
- Control gaps: Isolation model and host process both undecided (THR-028); no host-bridge allowlist; no CPU, memory or wall-clock budget; no outbound network policy; no defined execution identity for handlers with no triggering user; no execution observability; no review requirement.
- Impact: Critical
- Impact justification: Code execution inside a platform process, with reach to whatever that process holds and, on escape, the host. The upper bound depends on a host decision not yet made.
- Likelihood: Medium
- Likelihood justification: Not exploitable today. Once built, the exfiltration variant needs no vulnerability at all — only a customization author with a motive and outbound network access.
- Overall priority: High
- Confidence: Low
- Evidence: Architecture — `architecture/principles.md` invariant 6, `architecture/constraints.md` customization runtime, unknown U1; forward-looking.
- Security objectives: Safe extensibility; Confidentiality of infrastructure intelligence; Service availability during incidents.
- Uncertainty or disagreement: Confidence is deliberately Low. This is rated on stated intent with no design to evaluate, and should be re-assessed as soon as U1 closes. Routing customization through the API removes the unauthorized-access path cleanly, which is a genuine strength of the intended shape; what it does not touch is exfiltration of authorized data, resource consumption, or the consequences of the host choice.
- Supersedes: None

### THR-020 — Configuration-derived schema changes destroy configurable data

- Status: Active
- STRIDE categories: Tampering, Denial of service
- Related assets: AST-004, AST-005, AST-007, AST-011
- Relevant actors: ACT-006, ACT-013
- Trust boundaries: TB-009
- Preconditions: A configuration change reaches migrate through the promotion engine. Direct operator DDL outside configuration is THR-014, and is not bounded by the tier model.
- Attack path: YAML class definitions are the source of truth, and migrate computes a plan by diffing intent against the live database, then applies DDL. A definition change that drops or renames a column is therefore a data-destruction primitive expressed as an ordinary configuration edit — irreversible without a restore, and the customer owns backups (ASM-003), so the product cannot guarantee recovery. This is not silent, however: issue #29 implemented a destructive-operation gate, so the plan is classified and refused unless destruction is explicitly allowed. Loss therefore requires someone to override the refusal, which makes this a deliberate act or a habituated one rather than an accident. The tier model (ASM-021) bounds the blast radius further: `system` classes reject configuration change entirely, and `foundation` classes accept additive extension only, so core attributes of `incident` and `change-request` cannot be dropped or redefined from configuration. What remains destructible is what configuration owns — `implementation` classes in their entirety and the configuration-added attributes of foundation classes. That is not a small consolation prize: implementation classes are where a mature deployment keeps the data unique to its business, and losing one is as bad as losing a core class. Unknown U3 anticipates customer-driven schema change without assuming only engineers ship DDL, which widens the population who can trigger it.
- Legitimate-user abuse case: A configuration author renames an attribute to tidy up an implementation class, hits the destructive refusal, re-runs with the override because the change looks harmless, and destroys that column's contents across every existing record.
- Existing controls: A real destructive-operation gate exists. `migrate()` defaults to `allow_destructive=False` and raises `DestructivePlanError`, which enumerates each destructive operation by description rather than failing opaquely; column drops, table drops and type changes are all classified destructive. The CLI surfaces this as an explicit `--allow-destructive` opt-in. Changing DDL runs in a single transaction after a named restore point, so a failed apply rolls back rather than leaving a half-migrated schema. Migration is deliberate rather than automatic on bring-up, and schema version history is recorded. Tiering and additive-only foundation extension are intended structural controls that do not exist yet.
- Control gaps: No data-preservation strategy for renames, which are expressed as drop-plus-add and so destroy content even when the intent is cosmetic; no automated pre-change backup, and the named restore point covers apply failure rather than a successfully applied destructive plan; no rollback guarantee once destruction is allowed and committed; no record of who authorised an override; and no implementation of the tier and additive-only enforcement the reduced rating depends on. One in-code bypass is worth noting: `persistence/schema.py:apply_schema` wraps `migrate` with `allow_destructive=True` as its default, and `sync_table` drops and recreates a table outright. Both are documented as non-authoritative helpers for tests and resets, but they are importable and default to the unsafe side of a gate the CLI defaults to the safe side of.
- Impact: High
- Impact justification: Irrecoverable loss of implementation-owned operational data. Reduced from Critical because system-class immutability removes the privilege-escalation half of this threat entirely, and additive-only foundation extension protects core record content.
- Likelihood: Low
- Likelihood justification: Requires promotion authority over schema-affecting configuration, which is a small population, plus an explicit override of a refusal that names what will be destroyed. Rises materially if U3 opens schema change to a wider configuration audience, or if the override becomes habitual because it is routinely needed for benign changes.
- Overall priority: Medium
- Confidence: Medium
- Evidence: Implementation-observed — `backend/src/untangled/schema/migrate.py` lines 32 to 43 and 58 to 70 for the gate and restore point, `schema/plan.py` for destructive classification including type changes, `schema/cli.py` line 39 for the opt-in flag, `persistence/schema.py` lines 18 to 34 for the permissive wrapper; Architecture — unknowns U3 and U7, `architecture/tradeoffs.md` intentional migrate; Human-confirmed tiering (ASM-021).
- Security objectives: Configuration authority integrity; Service availability during incidents.
- Uncertainty or disagreement: The destructive gate is verified and this threat has been corrected accordingly; an earlier draft asserted no such gate existed. What holds the rating down now is partly built and partly not: the gate is real, while tier and additive-only enforcement are not. A failure of the latter (THR-027) returns this to Critical. The residual concern is habituation — a gate that must be overridden for ordinary renames trains people to override it.
- Supersedes: None

### THR-021 — Dependency supply-chain compromise reaches deployed systems

- Status: Active
- STRIDE categories: Tampering, Elevation of privilege, Information disclosure
- Related assets: AST-003, AST-001, AST-004, AST-005, AST-010
- Relevant actors: ACT-014, ACT-012
- Trust boundaries: TB-011
- Preconditions: A compromised or malicious package version enters a build that is subsequently deployed.
- Attack path: The backend depends on PyPI packages and the web tier on a large npm tree. A compromised package executes with the full privilege of the application process, which means access to the JWT signing secret, the session signing secret, the database connection and every record. The web tier is the more exposed surface simply because of transitive dependency count, and it holds the credential for every active session (THR-024). The customization runtime will add a further dependency surface. The human placed the vendor's own CI/CD out of scope but kept the dependency chain in scope, so the modelled path is a legitimate build consuming a poisoned upstream, not a compromised builder.
- Legitimate-user abuse case: Not applicable.
- Existing controls: `backend/requirements.lock` and `frontend/package-lock.json` pin resolved versions, which prevents silent drift on rebuild and is a genuine control. The AGPL and dependency-licensing policy imposes some deliberation about what is added.
- Control gaps: No SBOM, no dependency vulnerability scanning, no artifact signature or provenance verification, no pinning by digest, no review requirement for dependency additions, no runtime egress restriction that would limit what a compromised package could exfiltrate to.
- Impact: Critical
- Impact justification: Arbitrary code with full application privilege, including the secrets that make every other control meaningful.
- Likelihood: Low
- Likelihood justification: Lockfiles remove the accidental-upgrade path, so this requires either a deliberate dependency bump onto a poisoned version or a compromise of an already-pinned artifact. Real, but not routine.
- Overall priority: High
- Confidence: Medium
- Evidence: Implementation-observed — `backend/requirements.lock`, `frontend/package-lock.json`, `backend/pyproject.toml`; Human-confirmed in scope (ASM-018).
- Security objectives: Credential and token integrity; Safe extensibility.
- Uncertainty or disagreement: The boundary with the out-of-scope CI/CD pipeline is imprecise; a build-integrity compromise would present identically and is excluded by scope rather than by control.
- Supersedes: None

### THR-022 — Self-hosted deployments remain exploitable after advisories

- Status: Active
- STRIDE categories: Elevation of privilege, Information disclosure, Denial of service
- Related assets: AST-004, AST-005, AST-011, AST-001
- Relevant actors: ACT-011, ACT-012, ACT-005, ACT-015
- Trust boundaries: TB-001, TB-004, TB-011, TB-014
- Preconditions: A security defect is found and disclosed in a released version.
- Attack path: Customers self-host and apply their own updates (ASM-003, ASM-009). The vendor has no production access, no telemetry about deployed versions, no forced update mechanism and — today — no advisory or disclosure process at all. When a vulnerability is published, the fix and the exploit become available at the same moment, and every deployment that has not been updated is exploitable for as long as it takes that customer's change process to act, which in large enterprise and government environments is measured in weeks or months. Because the product is AGPL and public, an attacker can diff the fixing commit to derive the exploit. Internet exposure (ASM-002) means the vulnerable population is directly reachable.
- Legitimate-user abuse case: Not applicable.
- Existing controls: None. Advisory publication is intent, not capability.
- Control gaps: No security disclosure policy, no advisory channel, no CVE process, no version-support policy, no in-product update notification, and no way for a customer to know their deployment is behind on security fixes. Forks are out of scope for this model (ASM-022), so the gap recorded here concerns customers running stock releases.
- Impact: High
- Impact justification: Whatever the underlying defect permits, against a population that cannot be reached or measured.
- Likelihood: High
- Likelihood justification: Unpatched known vulnerabilities are among the most commonly exploited initial-access vectors, and the self-hosted enterprise patching cadence is genuinely slow. Given the number of Critical and High items in this catalogue, defects will be found.
- Overall priority: High
- Confidence: High
- Evidence: Human-confirmed — vendor publishes advisories, customers apply them; Implementation-observed — no `SECURITY.md` or disclosure documentation in the repository.
- Security objectives: Fail-closed configuration; Confidentiality of infrastructure intelligence.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-023 — Transport protection depends on unverified customer configuration

- Status: Active
- STRIDE categories: Information disclosure, Spoofing
- Related assets: AST-002, AST-001, AST-004, AST-005
- Relevant actors: ACT-011, ACT-012
- Trust boundaries: TB-001, TB-002, TB-003
- Preconditions: A deployment where TLS is absent, terminated further out than assumed, or where the secure-cookie opt-out is carried over from development.
- Attack path: `UNTANGLED_COOKIE_SECURE` exists so local development on plain HTTP can opt out of the `Secure` attribute, and `compose.yaml` sets it to `"false"` with a comment explaining why. Compose files are the single most-copied artifact when someone stands up a first real environment. If that value survives, the session cookie carrying the access JWT is transmitted over plain HTTP, on an internet-facing deployment, and can be captured in transit. There is no Strict-Transport-Security header to force upgrade (THR-009), no in-product check that requests arrived over TLS, and no startup refusal to run insecurely. Separately, TB-003 carries Bearer tokens from the web tier to the API over plain HTTP inside the deployment network by default (`http://api:8000`), so anyone positioned on that network sees credentials for every user. U9 leaves production HTTPS unresolved.
- Legitimate-user abuse case: An operator adapts the Compose file for a pilot deployment and does not realise the cookie flag matters.
- Existing controls: `secure` defaults to on when the variable is unset, so the failure requires an explicit opt-out rather than an omission — this is the right default and it matters. ADR 002 makes cookie attributes an explicit part of the decision.
- Control gaps: No HSTS, no in-product enforcement or detection of TLS, no refusal to start with `Secure` disabled outside development, no TLS on the internal web-tier-to-API hop, no guidance distinguishing the development Compose file from a deployment template.
- Impact: High
- Impact justification: Interception of session credentials yields impersonation of any operator, including administrators.
- Likelihood: Medium
- Likelihood justification: Requires both an operator misconfiguration and network position. The secure-by-default behaviour makes the misconfiguration deliberate rather than accidental, but the Compose file actively models the insecure setting.
- Overall priority: High
- Confidence: Medium
- Evidence: Implementation-observed — `compose.yaml` lines 50 to 54, `frontend/app/auth/config.server.ts`, `frontend/app/auth/session.server.ts` line 42; Architecture — ADR 002 clause 4, unknown U9.
- Security objectives: Credential and token integrity; Fail-closed configuration.
- Uncertainty or disagreement: ASM-004 records that TLS termination is customer infrastructure; how far the product should go in asserting transport security is an open design question.
- Supersedes: None

### THR-024 — Web-tier compromise yields every active operator session

- Status: Active
- STRIDE categories: Spoofing, Information disclosure, Elevation of privilege
- Related assets: AST-002, AST-003, AST-004, AST-005
- Relevant actors: ACT-012, ACT-014
- Trust boundaries: TB-002, TB-003
- Preconditions: Code execution or memory access in the SSR process, plausibly through THR-021.
- Attack path: ADR 002 makes the web tier a mandatory hop for all authenticated browser traffic and the sole holder of the cookie signing secret. That is a deliberate and well-reasoned trade — it keeps the credential out of JavaScript, which is the right call — but it concentrates risk. An attacker inside the SSR process reads the signing secret and can forge session cookies for any user, observes every access token flowing through `api_fetch_with_token`, and sees the plaintext username and password of every user who logs in while they are resident, because the login action handles credentials in that process. The web tier is also the availability chokepoint: it is on the path of every interactive request, a point ADR 002 acknowledges as a scaling consideration.
- Legitimate-user abuse case: Not applicable.
- Existing controls: The token is never exposed to browser JavaScript. Server-only modules are separated by the `.server.ts` convention. The refresh token is discarded at login and never retained, which genuinely limits what a resident attacker can persist with.
- Control gaps: No process isolation between credential handling and request rendering, no secret rotation, no detection of anomalous web-tier behaviour, no integrity monitoring of the deployed bundle.
- Impact: High
- Impact justification: All active sessions plus live credential capture; effectively total compromise of the operator population over time.
- Likelihood: Low
- Likelihood justification: Requires code execution in the SSR process, which is itself a significant prior compromise. This is a blast-radius observation more than an independent attack.
- Overall priority: Medium
- Confidence: High
- Evidence: Implementation-observed — `frontend/app/auth/session.server.ts`, `frontend/app/auth/api.server.ts`, `frontend/app/routes/login.tsx`; Architecture — ADR 002 consequences.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: None. This is the accepted cost of ADR 002, recorded so the concentration is visible rather than to reopen the decision.
- Supersedes: None

### THR-025 — Account-recovery flow enables takeover

- Status: Active
- STRIDE categories: Spoofing, Elevation of privilege
- Related assets: AST-001, AST-002
- Relevant actors: ACT-011, ACT-012, ACT-013
- Trust boundaries: TB-001, TB-004
- Preconditions: Self-service password reset exists (forward-looking; the human confirmed it as an intended path).
- Attack path: Recovery flows are a classic authentication bypass because they must, by construction, grant access to someone who cannot authenticate. The failure modes are well known: predictable or long-lived reset tokens, reset links that do not expire or invalidate on use, delivery to an address the attacker can influence, host-header injection poisoning the reset URL, response differences that enumerate accounts, and failure to terminate existing sessions after a reset. Untangled has no email or notification infrastructure today, so the entire delivery channel is undesigned. Combined with THR-006's absent revocation, a reset that does not invalidate outstanding tokens leaves the attacker's session alive after the victim recovers the account.
- Legitimate-user abuse case: An operator uses recovery to take over a colleague's account rather than requesting a permission change, because it is faster.
- Existing controls: None; the feature does not exist.
- Control gaps: Everything, by definition. Recorded so the design is done deliberately rather than discovered.
- Impact: High
- Impact justification: Direct account takeover, including administrative accounts.
- Likelihood: Low
- Likelihood justification: Not exploitable today. This rises to High if the flow is built without out-of-band verification, single-use expiring tokens, and session invalidation on reset.
- Overall priority: Medium
- Confidence: Low
- Evidence: Human-confirmed as an intended path; no implementation exists.
- Security objectives: Credential and token integrity.
- Uncertainty or disagreement: Whether recovery is even needed once SSO lands is unresolved — ASM-005 keeps local login enabled for break-glass, which is exactly the account where recovery is most dangerous and most tempting to build.
- Supersedes: None

### THR-026 — Divergent legacy and versioned API surfaces apply controls inconsistently

- Status: Active
- STRIDE categories: Elevation of privilege, Information disclosure
- Related assets: AST-004, AST-005
- Relevant actors: ACT-002, ACT-003, ACT-013
- Trust boundaries: TB-005
- Preconditions: Both the unversioned legacy routes and the `/api/v1` routes remain mounted, as they are today.
- Attack path: Each class is served by two routers built from the same factory but with different behaviour: legacy carries create, update and delete plus scalar-FK reads, while v1 carries reads with foreign-key identity enrichment. Both are mounted simultaneously. Two parallel paths to the same data is a recurring source of control drift — a validation rule, projection restriction, or future record-level authorization check added to one surface and not the other creates a bypass that looks like a bug rather than a vulnerability. The legacy surface is documented for removal under issue #117 but has no removal date, and deprecation markers in OpenAPI do not prevent use.
- Legitimate-user abuse case: A client that finds v1 restrictive silently falls back to the legacy surface and keeps working, entrenching the surface that was meant to disappear.
- Existing controls: Both surfaces come from `build_class_router`, so authorization is applied identically today through the same `require_class_operation` dependency. Removal is tracked as issue #117 in line with the API-compatibility-cleanup convention. The shared factory is the reason this is currently Low rather than higher.
- Control gaps: No removal date or condition, no usage telemetry to know when the legacy surface is unused, no test asserting that both surfaces enforce identical authorization, no mechanism preventing a future change from applying to only one.
- Impact: Medium
- Impact justification: Contingent on a future divergence rather than a present defect; if one occurs it is an authorization bypass on a class.
- Likelihood: Low
- Likelihood justification: The shared factory makes accidental divergence unlikely while it lasts, and record-level authorization does not yet exist to be applied unevenly.
- Overall priority: Low
- Confidence: High
- Evidence: Implementation-observed — `backend/src/untangled/records/router_factory.py`, `backend/src/untangled/main.py` lines 30 to 34; Architecture — `AGENTS.md` section 3.9 API compatibility cleanup, ADR 009.
- Security objectives: Least-authority record access.
- Uncertainty or disagreement: None.
- Supersedes: None

### THR-027 — Class-tier enforcement failure returns core schema to configuration control

- Status: Active
- STRIDE categories: Elevation of privilege, Tampering
- Related assets: AST-006, AST-001, AST-007, AST-004
- Relevant actors: ACT-006, ACT-012, ACT-013, ACT-015
- Trust boundaries: TB-009, TB-014
- Preconditions: The tier model is implemented and configuration is promoted into production.
- Attack path: The reduced ratings on THR-018 and THR-020 both rest on one control: configuration cannot alter `system` classes, and can only add to `foundation` classes. That control has to correctly classify every class and correctly reject every non-conforming change, on every promotion, and it has to fail closed. The leading candidate — an enforced `i_*` prefix on every configuration-authored class and attribute name — is a better shape than it first appears, because it is a namespace partition rather than a per-class list: core owns everything unprefixed, so a new core class is protected the moment it is created, and there is no registry to forget to update. The residual failures are narrower but real. Name comparison still has to be exact under normalisation: `I_foo` versus `i_foo`, kebab `i-foo` versus snake `i_foo`, and Unicode confusables in the prefix each let a configuration name escape the configuration namespace. The prefix must be checked at every layer that acts on a definition, not only at load — a check in the YAML loader that migrate does not repeat is not a control. Any core class or attribute that happens to begin with `i_` becomes claimable by configuration. If additive-only extension is enforced by comparing attribute lists but not attribute definitions, configuration can redefine a core attribute's type, nullability, or constraint without adding anything, and the prefix does not help because the attribute name is already core-owned. Success at any of these restores the ability to alter `user`, roles and permissions from configuration, which is direct privilege escalation, or to drop core columns, which is data destruction.
- Legitimate-user abuse case: A configuration author finds a naming form the prefix check does not normalise, discovers the definition applies to core data, and keeps using it because it solved their problem.
- Existing controls: None. The tier model is confirmed intent with no implementation, tracked as issue #116.
- Control gaps: Tier identity mechanism deliberately deferred, with the `i_*` prefix a preference rather than a decision; no defined normalisation rule for the prefix comparison; no defined behaviour for a core name that collides with the reserved prefix; additive-only semantics deliberately left undefined until customization is built, so attribute-definition-granularity redefinition is not yet in scope for any check; no requirement that the tier check be applied at migrate as well as at load; no startup or promotion-time verification that the deployed core class set matches its expected tiers; no test asserting that a system-class change is rejected.
- Impact: Critical
- Impact justification: Restores configuration authority over identity and access-policy schema, which is the exact outcome the tier model exists to prevent, and does so silently.
- Likelihood: Medium
- Likelihood justification: Not exploitable today. Once built, this is a bespoke security control of a kind that is routinely got wrong on the first attempt. A reserved-prefix namespace partition is a stronger starting point than a per-class registry and would likely justify Low once adopted and enforced at every layer that consumes a definition — but the mechanism is explicitly deferred, so the rating cannot yet be credited to it.
- Overall priority: High
- Confidence: Low
- Evidence: Human-confirmed tiering intent (ASM-021, issue #116) with no design or implementation; Implementation-observed — `backend/class-definitions/` currently carries no tier marking of any kind, and `user.yaml`, `role.yaml`, `permission.yaml`, `role-permission.yaml`, `user-role.yaml` and `refresh-token.yaml` sit alongside `incident.yaml` and `change-request.yaml` with nothing distinguishing them.
- Security objectives: Configuration authority integrity; Least-authority record access; Fail-closed configuration.
- Uncertainty or disagreement: Confidence is Low because the mechanism is deliberately deferred, which is a reasonable sequencing decision given how much foundational work precedes customization. This threat exists to keep the dependency visible: it is the single control carrying the impact reduction on two other threats, so it should not be allowed to be built casually when its turn comes.
- Supersedes: None

### THR-028 — Customization host process and the identity it presents to the API are undecided

- Status: Active
- STRIDE categories: Spoofing, Elevation of privilege, Information disclosure
- Related assets: AST-002, AST-003, AST-004, AST-005, AST-008
- Relevant actors: ACT-007, ACT-013, ACT-012
- Trust boundaries: TB-002, TB-003, TB-010
- Preconditions: The customization runtime exists (forward-looking) and a host process has been chosen for it.
- Attack path: An earlier draft of this threat argued that authorization belongs in the data layer rather than at the HTTP edge. The human's challenge to that is accepted and the framing has changed. If customer JavaScript never runs inside the API process, and reaches data only by calling the API over HTTP, then the HTTP edge *is* the data boundary and enforcing there is correct rather than merely convenient. That is the expected shape: JavaScript only, a curated set of exposed functions, and one of three candidate hosts — the web tier, the browser, or a separate process that does not exist yet. What remains is not the enforcement layer but the two properties the enforcement depends on. The first is the identity the host presents. HTTP-edge authorization is only meaningful if the customization's calls carry the triggering user's authority; if the host holds a service account with broad permissions and calls on the user's behalf, every check passes and enforces nothing, and this failure looks like ordinary integration code. The second is the choice of host, where the three candidates are not equivalent. The web tier is the worst available option: it holds the cookie signing secret and every access token in flight passes through it, so customer code there sits in a credential-harvesting position over the whole operator population, which is THR-024's blast radius handed to untrusted code. The browser is not an enforcement location at all — anything checked only there is advisory, since a user can call the API directly with their own token — and it also ships customization source to every user, which sits badly with the confidentiality AST-008 assumes. A separate process is the clean option, and its safety rests on conditions the human has already named: no database credentials, no direct database reachability, and constrained network and filesystem access.
- Legitimate-user abuse case: A customization is given a service identity so that a scheduled handler can work when no user is logged in, and every ad-hoc handler then inherits that identity because it is the one that works.
- Existing controls: The API authenticates independently rather than trusting a caller-asserted identity — the web tier forwards the access token as a `Bearer` header, `get_current_user` validates the JWT, re-reads the user row and rejects inactive accounts, and permissions resolve from the database per request. RBAC is applied uniformly across record routes through one shared dependency. Nothing untrusted executes anywhere today.
- Control gaps: No decision on the customization host; no requirement that customization calls carry the triggering user's identity rather than a service identity; no stated constraint that the web tier and any future customization host must not hold database credentials or reach the database directly; no network or filesystem policy for a customization host; no constraint recorded anywhere that the API process must continue to run only trusted code.
- Impact: High
- Impact justification: A service-account identity would flatten authorization for all customization at once; the web-tier host would expose every session credential. Both are broad but neither exceeds the operator population's own reach.
- Likelihood: Low
- Likelihood justification: Nothing is built, and the human's stated inclination is toward the safer options. This is recorded to keep the constraints attached to the decision, not because the dangerous path is expected.
- Overall priority: Medium
- Confidence: Low
- Evidence: Implementation-observed — `backend/src/untangled/auth/dependencies.py` for independent API authentication, `frontend/app/auth/api.server.ts` line 75 for token forwarding, `frontend/app/auth/session.server.ts` for the web tier's secret custody; Human-confirmed expectations on the customization runtime (ASM-023).
- Security objectives: Safe extensibility; Least-authority record access; Credential and token integrity.
- Uncertainty or disagreement: The human is right that HTTP-edge enforcement is not weaker than data-layer enforcement when nothing untrusted shares the API process, and the earlier framing over-assumed in-process co-location. Two residual observations are worth keeping. That "only trusted code in the API process" condition is load-bearing and is not recorded as a constraint anywhere, so nothing prevents a later decision from quietly voiding it. And route-layer-only enforcement means a bug in a future worker or event handler has no second line of defence, which is a defence-in-depth observation rather than a threat, since those components are trusted core code.
- Supersedes: None

## 11. Prioritized risk register

| Priority | Threat ID | Threat | Impact | Likelihood | Confidence | Primary rationale |
| --- | --- | --- | --- | --- | --- | --- |
| Critical | THR-001 | Hardcoded signing-secret fallback permits access-token forgery | Critical | High | High | Published default plus silent fallback equals forgeable admin identity |
| Critical | THR-002 | Documented default credentials reach a production deployment | Critical | High | High | Published admin password and database credentials, no production guard |
| High | THR-003 | Unthrottled credential brute force and stuffing against local login | High | High | High | Internet-facing login with no rate limit, lockout, or MFA |
| High | THR-004 | Unauthenticated computational exhaustion through password hashing | High | Medium | Medium | Argon2 cost is attacker-controllable volume against a critical service |
| High | THR-011 | Class-wide permissions expose every record and every field | High | High | High | No record-level or field-level authorization exists by construction |
| High | THR-012 | Bulk exfiltration through the search API | High | High | High | Paginated full projection with no volume control and no read audit |
| High | THR-013 | Database resource exhaustion through unbounded pattern search | High | Medium | High | Client-supplied regex reaches PostgreSQL with no statement timeout |
| High | THR-014 | Operator CLI and direct database access bypass authorization and audit | High | Medium | High | Full DDL and DML authority outside RBAC and outside any audit trail |
| High | THR-016 | Unauthenticated surface exceeds the permitted health check | Medium | High | High | Anonymous OpenAPI schema publishes the complete attack surface |
| High | THR-017 | Audit coverage cannot detect or reconstruct malicious activity | High | High | High | No read, authentication, authorization, or change logging exists |
| High | THR-018 | Merge rights on customer configuration confer bounded production authority | High | Medium | Medium | Git authority bypasses RBAC and audit; bounded by tiering that is not built |
| High | THR-019 | Sandbox escape or covert exfiltration by customization JavaScript | Critical | Medium | Low | Untrusted code in a platform process with an undecided isolation model |
| High | THR-021 | Dependency supply-chain compromise reaches deployed systems | Critical | Low | Medium | Full application privilege including all signing secrets |
| High | THR-022 | Self-hosted deployments remain exploitable after advisories | High | High | High | No disclosure process, no telemetry, slow enterprise patch cadence |
| High | THR-023 | Transport protection depends on unverified customer configuration | High | Medium | Medium | Compose models the insecure cookie opt-out; no HSTS and no TLS check |
| High | THR-027 | Class-tier enforcement failure returns core schema to configuration control | Critical | Medium | Low | One unbuilt bespoke control carries the impact reduction on THR-018 and THR-020 |
| Medium | THR-006 | Stolen access tokens stay valid until expiry with no revocation path | Medium | Medium | High | Stateless tokens with no denylist, offset by immediate permission checks |
| Medium | THR-007 | Refresh-token theft with no rotation-reuse detection | High | Low | High | Rotation without reuse detection; little exposure until integrations land |
| Medium | THR-009 | Missing response headers and cache controls on authenticated pages | Medium | Medium | High | Removes the containment layer for injection and cache exposure |
| Medium | THR-010 | Stored script injection abuses the server-side session | High | Low | Medium | React escaping holds today; rich text would change that |
| Medium | THR-015 | Stub actor identity collides with the seeded administrator | Medium | Medium | High | Administrative actions are indistinguishable from system writes |
| Medium | THR-020 | Configuration-derived schema changes destroy configurable data | High | Low | Medium | Tiering protects core schema; implementation-owned data stays destructible |
| Medium | THR-024 | Web-tier compromise yields every active operator session | High | Low | High | Deliberate concentration from ADR 002; needs prior code execution |
| Medium | THR-025 | Account-recovery flow enables takeover | High | Low | Low | Not built; rises sharply if built without out-of-band verification |
| Medium | THR-028 | Customization host process and the identity it presents to the API are undecided | High | Low | Low | Host choice and call identity decide whether HTTP-edge enforcement means anything |
| Low | THR-005 | Username enumeration through login behaviour differences | Low | Medium | High | Reliable reconnaissance only; a precursor to THR-003 |
| Low | THR-008 | Login cross-site request forgery places a victim in an attacker's session | Medium | Low | High | Requires luring an operator who does not notice the wrong identity |
| Low | THR-026 | Divergent legacy and versioned API surfaces apply controls inconsistently | Medium | Low | High | Shared factory prevents divergence today; risk is future drift |

Order by priority, then threat ID. Ratings must be justified in the threat catalogue; do not rely on the table alone.

## 12. Abuse cases

| Threat ID | Legitimate capability | Misuse path | Affected asset or boundary | Existing constraint | Remaining exposure |
| --- | --- | --- | --- | --- | --- |
| THR-011 | Reading records of a class the role permits | Read every record of that class, including confidential or security-sensitive ones | AST-004, AST-005 / TB-005 | Class-level permission check only | Full class contents to any permitted principal |
| THR-012 | Running a search to build a report | Page through the entire class with full attribute projection and copy it out | AST-004, AST-005 / TB-005 | 200-row per-request cap | Unlimited cumulative extraction, unrecorded |
| THR-013 | Using the regexp or contains search operators | Submit catastrophic patterns repeatedly to exhaust the shared database | AST-011, AST-010 / TB-006 | Invalid regex is caught; result count is capped | No timeout, cost limit, or query throttle |
| THR-014 | Operating the deployment and running migrations | Read hashes, grant roles, or alter records directly in the database | AST-010, AST-006 / TB-007 | Deliberate rather than automatic migration | No least privilege, no database audit, no detection |
| THR-015 | Running seed or batch jobs | Attribute a deliberate action to the shared stub-equals-admin identity | AST-009 / TB-007 | Collision is documented in code | Administrative actions are repudiable |
| THR-010 | Entering free text into an incident | Plant content that executes in an administrator's authenticated context | AST-006 / TB-001 | React escapes output by default | Escalation path opens with any rich-text surface |
| THR-018 | Authoring and merging configuration | Add an implementation class or foundation extension that captures or duplicates sensitive content into a surface with different visibility | AST-007, AST-004 / TB-009 | Class tiering keeps identity and access-policy schema out of reach; customer Git review if configured | No product-side approval, validation, or audit; tiering not built |
| THR-019 | Writing a customization for a business purpose | Add covert collection and outbound transmission of data the triggering user is entitled to see | AST-004, AST-005 / TB-010 | None built | Confidential customization is not reviewed by anyone; API-mediated access bounds *what* is read, not where it goes |
| THR-020 | Editing a class definition to tidy a field | Override the destructive refusal for a rename that looks harmless and destroy its data across all records | AST-004 / TB-009 | Destructive plans refused unless explicitly allowed; migration deliberate; version history recorded | Renames still destroy content; no guaranteed rollback once allowed; no record of who overrode |
| THR-027 | Naming a new implementation class | Find a name form the reserved-prefix check does not normalise and have the definition apply to core data | AST-006, AST-001 / TB-009 | None built | Tier identity mechanism deliberately deferred; string-based identity needs exact normalisation |
| THR-028 | Running a scheduled customization with no logged-in user | Give the customization host a service identity so it works unattended, and every handler inherits it | AST-004, AST-006 / TB-010 | None built | HTTP-edge authorization passes and enforces nothing once the caller is not the user |
| THR-006 | Signing out at the end of a shift | Continue using a captured access token until it expires | AST-002 / TB-002 | Short default TTL; immediate deactivation checks | No revocation; TTL is operator-configurable upward |

## 13. Threat chains

| Chain | Component threats | Combined attack path | Why composition changes risk |
| --- | --- | --- | --- |
| Silent-default takeover | THR-016, THR-001, THR-002 | Anonymous `/openapi.json` reveals every route and model; the attacker mints a token with the published JWT default, or simply logs in as `admin` with the published seed password, then uses the mapped API to extract everything | Reconnaissance that is individually only Medium turns two configuration defaults into a precise, immediate, full compromise with no credential theft and no noisy guessing |
| Undetected mass exfiltration | THR-003, THR-011, THR-012, THR-017 | One credential obtained by stuffing inherits every record of its class, search pages the class out in bulk, and no read logging or volume alerting exists to notice | Each part is survivable alone; together they mean a single low-privilege account loses the entire corpus with no evidence that it happened and no way to scope the breach afterwards |
| Configuration takeover | THR-018, THR-027, THR-020, THR-019, THR-028 | Compromise of a developer's Git credential lands a change on the configuration trunk, which reaches production on the next release. Class tiering is supposed to stop that reaching identity or core schema, so the attacker either finds a tier-enforcement weakness, or skips schema entirely and ships customization code — which is safe only if its host presents the triggering user's identity | Git authority bypasses authentication, RBAC and audit simultaneously, and the resulting access is durable rather than a transient session. The release step and any separation of merge from deployment credentials add delay and a chance to notice, but not a barrier. The tier model narrows the schema route to two links, and every remaining link is an unbuilt control |
| Session capture with no kill switch | THR-023, THR-009, THR-006, THR-024 | A carried-over insecure cookie setting or a shared cache exposes a session; no HSTS forced the upgrade; the captured token cannot be revoked and remains valid for the full configured lifetime | Capture and irrevocability compose into a guaranteed-duration foothold; the absence of a revocation path converts a containable incident into a waiting game |
| Availability collapse during an incident | THR-004, THR-013, THR-022 | An attacker who knows the deployment is unpatched saturates Argon2 on the login path and simultaneously issues catastrophic regex searches, taking down the tool the customer needs to coordinate their response | Availability loss is timed to coincide with the customer's worst moment, and the same attacker causing the outage benefits from the impaired response |
| Insider action without a trace | THR-014, THR-015, THR-017 | An operator acts directly in the database, and the writes that do carry attribution point at the shared stub-equals-admin identity, while nothing else was ever logged | Attribution is not merely missing but actively misleading, which is worse than silence for an investigation |

## 14. Existing control coverage

| Threat ID | Existing preventive controls | Existing detective controls | Existing recovery controls | Material gaps |
| --- | --- | --- | --- | --- |
| THR-001 | Web tier fails closed on its own secret; short token TTL | None | None | No API startup assertion, no default rejection, no key rotation |
| THR-002 | Passwords are overridable by environment; seeding is deliberate | None | None | No production guard, no forced change, no default detection |
| THR-003 | Argon2id cost; generic failure message; inactive users rejected | None | None | No rate limit, lockout, MFA, or authentication logging |
| THR-004 | None | None | Orchestrator restart | No throttling, concurrency cap, shedding, or connection pooling |
| THR-005 | Uniform error body and status | None | None | No dummy verification, no timing normalisation |
| THR-006 | Short default TTL; per-request active and permission checks | None | Deactivation takes effect immediately | No denylist, token version, TTL ceiling, or sign-out-everywhere |
| THR-007 | Opaque tokens, digest-only storage, atomic rotation, expiry check | None | Manual revocation of a known token | No reuse detection, family invalidation, or authentication log |
| THR-008 | `sameSite=lax`; `safe_next_path` redirect constraint | None | None | No CSRF token or origin check on login |
| THR-009 | `httpOnly` cookie limits script access to the token | None | None | No CSP, HSTS, framing, or cache-control headers |
| THR-010 | React default escaping; no `dangerouslySetInnerHTML` present | None | None | No CSP, no sanitisation policy for future rich text |
| THR-011 | Consistent class-level RBAC on every record route | None | None | No record-level or field-level authorization, no read audit; modelling sensitive work as its own class does not cover sensitivity discovered after creation |
| THR-012 | 200-row per-request cap; RBAC gate | None | None | No volume budget, rate limit, export detection, or read log |
| THR-013 | Result cap; nesting bounds; invalid-regex handling with rollback | None | Connection or process restart | No statement timeout, cost limit, regex bound, or pooling |
| THR-014 | Deliberate migration; schema version history | Schema version history only | Customer backups (outside the product) | No least-privilege roles, database audit, or change detection |
| THR-015 | Collision is documented in code | None | None | No distinct system principal or provenance discriminator |
| THR-016 | None | None | None | No production documentation configuration; endpoints exceed intent |
| THR-017 | Write attribution via `created_by` and `updated_by` | None | None | No read, authentication, authorization, or change logging; no tamper evidence; no export |
| THR-018 | Repository separation from core code and class tiering, both intended and unbuilt; Git history; customer-configured review if present | Git history | Git revert, if promotion supports rollback | No product-enforced approval, provenance, or platform audit; tier boundary not implemented |
| THR-019 | API-mediated access removes the unauthorized-read path by design, though nothing is built | None | None | Isolation model, host process, resource budgets, egress policy, and untriggered-handler identity all undecided |
| THR-020 | Destructive-operation gate defaulting to refuse; deliberate migration; computed plans; version history; intended additive-only foundation extension | Version history; the refusal enumerates each destructive operation | Transactional apply after a named restore point; customer backups | No rollback once destruction is allowed; renames destroy content; override not attributed; permissive `apply_schema` wrapper; additive-only enforcement not implemented |
| THR-021 | Lockfiles pin resolved versions; licence policy adds deliberation | None | Lockfile rollback | No SBOM, scanning, signature verification, or egress restriction |
| THR-022 | None | None | Customer-applied updates | No disclosure policy, advisory channel, version telemetry, or notification; forks are out of scope |
| THR-023 | `Secure` defaults on when unset; ADR 002 fixes cookie attributes | None | None | No HSTS, TLS assertion, insecure-start refusal, or internal TLS |
| THR-024 | Token never exposed to browser script; refresh token discarded; server-module separation | None | Secret change forces re-authentication | No process isolation, secret rotation, or integrity monitoring |
| THR-025 | None; feature does not exist | None | None | Entire design outstanding |
| THR-026 | Shared router factory applies identical authorization today | OpenAPI deprecation markers | Removal tracked as issue #117 | No removal date, usage telemetry, or parity test |
| THR-027 | None built | None | None | Tier identity mechanism, prefix normalisation rule, enforcement at migrate as well as load, additive-only semantics, and enforcement tests all outstanding |
| THR-028 | Independent API authentication rather than caller-asserted identity; uniform RBAC across record routes; nothing untrusted executes anywhere yet | None | None | Host process undecided; no requirement that customization calls carry the triggering user's identity; no standing constraint keeping database credentials away from a customization host or untrusted code out of the API process |

Existing controls are observations, not proof of effectiveness. Record uncertainty where controls have not been verified.
The threat catalogue is authoritative. This table is a derived summary and must be updated whenever a threat's control coverage changes.

## 15. Accepted risks and unresolved questions

### Human-accepted risks

| Threat ID | Decision | Rationale | Accepted by | Review trigger |
| --- | --- | --- | --- | --- |
| None | No risks accepted at TM-REV-001 | Acceptance was not sought during the initial interview; the human should decide which items are accepted rather than remediated | Not accepted | First revision after security requirements are defined |

### Open questions

| Related ID | Question | Why it matters | Owner or decision path |
| --- | --- | --- | --- |
| THR-011, ASM-019 | Is record-level authorization intended, and on what model — ownership, team, or confidentiality classification? The field-level half is now answered by ASM-025 | Determines whether the largest present exposure is a gap to close or a risk to accept | Human architect, then security design |
| THR-011, ASM-025 | Should attribute-level default-allow be global, or should certain classes default to restricted? | Default-allow means a newly added attribute is world-readable until someone restricts it; a class like `user` would sensibly default the other way | Human architect, then security design |
| THR-011, ASM-025 | How is "no access is indistinguishable from non-existent" held consistently across every surface that describes a class — search, fetch, write validation, and generated models? | Agreed as a governing principle for attribute-level access control; it is a whole-system property and needs to be a stated requirement when that feature is built | Security design, during attribute-level authorization |
| ASM-025 | How are recursive child roles resolved — cycle detection, a warning on excessive nesting depth, and per-request cost? | A cycle is a denial of service, deep nesting makes the effective grant non-obvious to whoever assigns the parent role, and resolution cost lands on every request | Security design |
| THR-006, THR-007 | Should sessions become revocable, and through which mechanism? Current preference is a UUIDv7 `jti` with a revocation list in PostgreSQL, moving to Redis only if measurement demands it | ADR 002 left this genuinely open; it gates incident response capability. The token is to stay free of authorization claims, so authority continues to resolve per request | Issue #67, then an ADR |
| THR-001, THR-006 | When does signing move from HS256 to ES256, and what key management does that imply? | Asymmetric signing separates issuing from verifying, so a verifier compromise stops being a forgery capability | Issue #67 |
| THR-003, THR-004, ASM-006 | What form does in-product rate limiting take, and which surfaces does it cover? | Confirmed as belonging in the product and tracked as issue #33; scope and defaults are still undetermined | Issue #33, then security design |
| THR-013 | How is `regexp` query cost bounded — a `statement_timeout`, `EXPLAIN`-based cost analysis, pattern analysis, or restricting the operator to certain roles? | The operator is worth keeping, so the answer has to be mitigation rather than removal. Nothing is implemented, so the shape is open | Security design, with product input |
| THR-016 | Should the OpenAPI and Swagger routes be disabled outside development, require authentication, or both? | Both are considered prudent and neither is implemented; the current open state diverges from a confirmed architectural constraint | Human architect |
| THR-017, ASM-015 | What is the audit architecture — event model, storage, tamper evidence, retention, and SIEM export format? | Confirmed as required, and needing more analysis before it can be specified | Security design, likely an ADR |
| THR-027, ASM-021 | If the `i_*` reserved prefix is adopted, what is the exact normalisation rule, which layers enforce it, and what happens to a core name that already matches the prefix? | A string-based namespace partition is only as strong as its comparison, and a check at load that migrate does not repeat is not a control | Issue #116, then security design |
| THR-027, ASM-021 | What exactly does additive-only mean for a `foundation` class — added attributes only, or also constraints, associations, defaults, and validation on core attributes? Deliberately deferred until customization is designed | The looser the definition, the more of a core class configuration can effectively redefine without adding anything. Recorded now so it is decided rather than discovered | Security design, when issue #116 and the customization design are taken up |
| THR-019, ASM-010 | What is the customization sandbox isolation model, including host bridges, resource budgets, and egress policy? | Unknown U1; THR-019 cannot be properly rated until it closes | Unknown U1 |
| THR-028, ASM-023 | Which process hosts customization, and does it call the API as the triggering user or under a service identity? | The host choice decides what untrusted code sits beside — the web tier holds the cookie secret and every token in flight — and a service identity would make HTTP-edge authorization pass without enforcing anything | Unknown U1; security design |
| THR-028, ASM-023 | Should "the API process runs only trusted code" and "no customization host holds database credentials" be recorded as standing constraints? | Both are load-bearing for the intended model and neither is written down, so nothing prevents a later decision from quietly voiding them | Security design |
| THR-019, ASM-023 | Which identity does a handler run as when nothing user-initiated triggered it — a scheduled escalation, a queued event, or a retry? | "Data does not pass between user identities" has no meaning without an answer, and a system identity reintroduces privileged execution. The human accepts that exceptions may be needed; each one is a deliberate hole and needs its own justification and control | Unknown U1; security design |
| THR-019, ASM-023 | What prevents a customization exfiltrating data its user *is* entitled to read? | API-mediated access bounds what code can read and says nothing about where it sends it; server-side egress is a better exfiltration position than a browser | Unknown U1; security design |
| THR-011, ASM-019 | What form does record-level access control eventually take, given that an incident may be reclassified as a security incident only after triage? | Modelling sensitive work as its own class covers sensitivity known at creation, not sensitivity discovered later, and by then the record has already been broadly readable | Human architect, then security design |
| THR-023, ASM-004 | How far should the product go in asserting transport security rather than assuming it? | Unknown U9's production HTTPS half is still open | Unknown U9 |
| THR-022, ASM-009 | What is the vulnerability disclosure and advisory process, and how do customers learn they are behind? | Confirmed as intent with no capability behind it | Human architect |
| THR-025 | Given that self-service recovery is required wherever local accounts exist and does not apply to SSO accounts, what design keeps it safe for break-glass local accounts specifically? | The account where recovery is most dangerous is exactly the one ASM-005 keeps enabled, so the risks have to be addressed in the design rather than by scoping the feature away | Human architect, then security design |
| THR-020 | Should renames be expressible as a preserving operation rather than drop-plus-add, and should overriding the destructive gate be attributed? | The gate from issue #29 is verified and working; what remains is that benign renames still require the override, which trains people to use it | Security design |
| ASM-012 | What is the event bus shape, and does it introduce a message-integrity boundary? | Unknown U2; would add trust boundaries not modelled here | Unknown U2 |

## 16. Change assessment

### Changes covered by this revision

- Initial threat model. No previous revision exists; nothing is superseded.
- Covers the Milestone 1 implementation at commit `c14e37f` and confirmed architectural intent as recorded in `architecture/` decisions 001 through 009 and unknowns U1 through U11.
- Incorporates configuration-model intent confirmed by the human during review of this draft: configuration lives in a repository separate from core product code, and class definitions are tiered `system` / `foundation` / `implementation` with every authentication and authorization class in the `system` tier (ASM-013, ASM-021). The tiering model is tracked as issue #116, is not yet implemented, and is to be documented as part of that issue rather than as a separate ADR now.
- Incorporates the customization execution expectation (ASM-023): JavaScript only, against a curated set of exposed functions, hosted outside the API process and reaching data only by calling the API.
- Incorporates the outline authorization direction beyond class-level CRUD (ASM-025): recursive child roles, role-gated attribute metadata in YAML, a per-class default access stance, and lack of access being indistinguishable from non-existence. Two ideas raised during review were withdrawn before being recorded as intent — a sentinel value marking restricted attributes, which conflicts with the indistinguishability principle, and carrying roles as token claims, which conflicts with prompt authorization change.
- Records two objectives arising from that direction: extensible authorization beyond class-level CRUD, and prompt authorization change without waiting out a token lifetime.
- Records the trunk-based configuration workflow and places the customer's CI/CD separation of merge, test-deployment and production-deployment authority out of scope (ASM-026), along with security assurance for customer forks (ASM-022).
- Designating every authentication and authorization class as `system` is stated by the human as a security requirement. It is recorded here as confirmed intent only; this skill may not write `/architecture/security/security-requirements.md`, so it still needs to be written as a requirement through the security-design flow.

### Newly introduced or materially changed threats

- All twenty-eight threats, THR-001 through THR-028, are new at this revision.
- Assets AST-001 through AST-012, actors ACT-001 through ACT-015, trust boundaries TB-001 through TB-014, and assumptions ASM-001 through ASM-026 are new at this revision.
- Two corrections were made against verified code after the first draft. THR-020 asserted that no destructive-change gate existed; issue #29 implemented one, and the threat, its abuse case and its control coverage have been rewritten around the gate, the transactional apply, and the named restore point. THR-028 originally argued that authorization belonged in the data layer rather than at the HTTP edge; the human's challenge was accepted, and it has been reframed around the undecided customization host and the identity it presents to the API.
- One threat was withdrawn before acceptance. A draft THR-029 described attribute-level restrictions leaking through search predicates, sorting and counts. It described an implementation defect in a feature that does not exist, and the agreed indistinguishability principle precludes it by construction, so its substance is recorded as required characteristics under THR-011 instead. The identifier is not reused.

### Re-run triggers

- Authentication, session, authorization, or privileged-access changes.
- New or materially changed sensitive data.
- New tenancy or isolation requirements.
- New external integrations or trust boundaries.
- Material deployment-topology, secret-management, or operational-access changes.
- Human decision that invalidates an assumption or accepted risk.
- Specifically for this revision: closure of unknowns U1, U2, U6, U7 or U9; arrival of SSO, the administration UI, account recovery, non-browser API clients, the configuration promotion engine, the customization runtime, or CMDB; adoption of a record-level authorization model; implementation of the attribute-level authorization direction in ASM-025; any decision to place authorization claims in the access token, or to run customer code inside the API process, either of which would invalidate ratings here; selection of a customization host process (THR-028); the arrival of token revocation or the move to ES256 under issue #67; in-product rate limiting under issue #33; or any change to the class-tier model in ASM-021, including the mechanism chosen to identify a tier, the definition of additive-only extension, or the set of classes designated `system`.

## 17. Revision history

| Revision | Date | Status | Scope or trigger | Author or agent | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| TM-REV-001 | 2026-08-02 | Draft | Initial model — Milestone 1 implementation plus confirmed architectural intent, rated against a production internet-facing single-tenant deployment | threat-model skill, primary agent (Claude Opus 5 Thinking High) | Not accepted |
