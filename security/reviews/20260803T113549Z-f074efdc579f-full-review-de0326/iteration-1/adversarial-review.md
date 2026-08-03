# Adversarial Review — Opus Critique

Status: Complete
Run ID: 20260803T113549Z-f074efdc579f-full-review-de0326
Iteration: 1
Assigned model (caller-supplied, not self-verified): claude-opus-5-thinking-high
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
| Threat-model SHA-256 | `5d27340e3e3e48d2a7e51a6163ccbebe920d7e5db9c8a273c89c663abc062adf` (verified against the pinned Git object and the working tree) |
| Security-requirements revision | None |
| Security-requirements source commit | None |
| Security-requirements SHA-256 | None |
| Run manifest | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/manifest.md` |
| Current Sol security review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-1/security-review.md` |
| Current Sol security-review SHA-256 | `8374cb9303db2b9e9a5b0767ccdde9a2a5abb38859db45aac3943bf45cd608f5` (verified) |
| Iteration 1 security review | Not applicable |
| Iteration 1 security-review SHA-256 | Not applicable |
| Iteration 1 adversarial review | Not applicable |
| Iteration 1 adversarial-review SHA-256 | Not applicable |

Validation performed before analysis: repository `HEAD` equals the pinned target commit; the threat model read from the pinned commit and the working tree both hash to the manifest value; the Sol iteration 1 artefact hashes to the manifest value; the output path is inside the supplied run directory and did not previously exist; the threat model is `Status: Accepted` at `TM-REV-001`, matching the manifest.

## 2. Scope

### In scope

- Full accepted TM-REV-001 scope: the single-tenant, customer self-hosted, internet-facing platform, comprising the FastAPI backend, the React Router v7 SSR web tier, and PostgreSQL, at the pinned commit.
- Implemented Milestone 1 surfaces: `/auth/*` including `/auth/rbac-probe`, class-wide RBAC, legacy and `/api/v1` Incident and Change Request routes, the predicate search compiler, FK identity enrichment, the schema-migration and seed CLIs, and the SSR session, gate, and record seams.
- Deployment inputs: `compose.yaml`, both Dockerfiles, Python and npm dependency manifests and lockfiles, and shipped class definitions.
- Forward-looking accepted intent (configuration promotion, class tiers, customization runtime and host, SSO, account recovery, non-browser clients, event bus, CMDB) to the extent TM-REV-001 models it.
- The complete Sol iteration 1 report: all fourteen findings, its coverage table, its withdrawn candidates, and its no-finding claims.

### Explicit exclusions

- Threat-model out-of-scope items only: physical and data-centre security; customer-owned host, network, load-balancer, Kubernetes and backup infrastructure; the vendor's own CI/CD; the customer's configuration CI/CD arrangements (ASM-026); customer forks of the core product (ASM-022); multi-tenant shared-database isolation (ASM-001).
- No additional exclusions were applied by this review.

### Scope limitations

- Static and read-only analysis. No process was started, no database was connected to, no HTTP request was issued, and no runnable exploit was executed. Every exploitability statement below is derived from code reading and from documented PostgreSQL, PyJWT, Starlette, argon2-cffi and WHATWG URL behaviour, not from observed runtime behaviour.
- Several critiques below concern resource-consumption amplification. The multipliers are derived from the code's own limits and query structure; absolute saturation thresholds remain unmeasured, exactly as Sol also records.
- React Router v7 document-response header propagation (AR-006) was reasoned about from the absence of any `headers` route export in the repository. It was not confirmed against a built server response, and that is precisely the evidence gap the critique asks to be closed.
- Dependency contents were not scanned against any advisory database, matching Sol's own limitation.

## 3. Executive adversarial assessment

### Overall assessment of Sol's review

Sol's report is materially sound on the ground it covers. Every one of the fourteen findings is real, the evidence citations resolve to the code they claim, and the two Critical findings are correctly identified and correctly rated. Sol also earned credit in three places that adversarial checking confirmed rather than overturned: the `safe_next_path` backslash bypass in SR-005 is a genuine defect that TM-REV-001 does not describe and that I reproduced by reading the guard against WHATWG URL normalisation rules; the withdrawal of SQL injection is correct, because the predicate compiler resolves every attribute name against the loaded class definition and composes identifiers through `psycopg.sql.Identifier` with values as placeholders throughout; and the withdrawal of the SSRF candidate is correct, because the only production caller of `search_collection` validates the collection against a two-entry allowlist in `find_list_option` before the request is built.

The review's weakness is not wrongness but shallowness in three specific directions, and one accounting problem.

First, Sol consistently stops at "the control is absent" and does not pursue "how much worse than absent". The clearest case is the database role. Sol correctly observes in SR-009 that one `DATABASE_URL` serves runtime, migration and seed, and correctly recommends role separation — but does not notice that the product's own migration path calls `pg_create_restore_point`, which the code and `docs/class-definitions.md` both acknowledge needs superuser or an explicit grant, and that the shipped default credential is the Compose bootstrap superuser. That changes SR-002's consequence from "complete data compromise" to command execution on the database host, and it makes SR-009's recommendation unachievable for the migration role without a product change. Similarly, SR-008 records that the search guardrails "bound output/shape rather than database work" and stops there, missing that the same guardrails positively permit roughly two thousand five hundred pattern predicates in one request, that the mandatory `COUNT(*)` evaluates the whole predicate a second time against every row regardless of `limit`, and that `offset` has no upper bound at all.

Second, Sol misses two present-day disclosure paths in implemented code. The versioned FK identity enrichment returns the referenced record's display value with no authorization decision about the referenced class, so `incident:read` alone yields the display name of every user who has touched an incident. And both operator CLIs print the full `DATABASE_URL`, password included, to standard output, while the seed CLI additionally prints the effective password for every seed principal — including an operator-supplied production password, not merely the shipped default that Sol's evidence line describes.

Third, one Sol claim runs ahead of its evidence in a way that narrows an accepted threat. SR-006 and the executive summary state that the authenticated layout's `Cache-Control: private, no-store` disconfirms the threat model's cache-control concern. The only supporting evidence is a loader-level unit assertion, no route in the repository exports a `headers` function, and Sol's own section 14 concedes that runtime propagation was not inspected. A narrowing of accepted intent should not rest on evidence the same report describes as missing.

The accounting problem is smaller but will mislead consolidation if left: Sol's finding table links SR-011 to THR-027 and SR-012 to THR-019, while its coverage table marks both threats "Insufficient evidence". A consolidator reading the finding table will believe the customization sandbox and tier-enforcement design were analysed. They were not, and the coverage table is the honest entry.

Confidence should rise on SR-001, SR-002, SR-005, SR-007, SR-010, SR-012 and SR-013, all of which survived independent checking intact. Confidence should fall on SR-006's disconfirming half. SR-002 and SR-009 should carry a larger blast radius. SR-003 and SR-008 need their mechanisms completed before their recommendations can be called minimal and effective.

### Most consequential challenges

- **AR-001** — The runtime, migration and seed paths share a database role that the product's own migrate step requires to be superuser-equivalent, and the shipped default is a bootstrap superuser. Any SQL-level compromise, including the one SR-002 already describes, therefore reaches `COPY … FROM PROGRAM` and file access on the database host rather than stopping at the data.
- **AR-005** — The search guardrails Sol treats as merely ineffective are an amplifier. Depth 3 with fifty children per logical list permits about two thousand five hundred `regexp` leaves per request, the unconditional `COUNT(*)` evaluates them a second time across every row irrespective of the 200-row cap, and `offset` is unbounded.
- **AR-006** — SR-006 narrows an accepted threat-model claim on evidence Sol itself records as unverified, and omits the API tier's headers entirely.
- **AR-002** — Versioned FK identity enrichment discloses referenced-class content with no permission check on the referenced class, which is a present implementation of exactly the risk ASM-024 flags as provisional.
- **AR-004** — The unauthenticated login path has no request-body or password-length bound, and every synchronous route shares one bounded worker pool, so denial of the whole API needs far fewer requests than SR-003's "unlimited attempts" framing implies.

### Missed-finding candidates

- AR-001 — Shared superuser-equivalent database role escalates database access to host command execution.
- AR-002 — FK identity enrichment discloses referenced-class content without a referenced-class permission check.
- AR-003 — Operator CLIs print the database password and effective seed passwords to standard output.
- AR-004 — Unbounded login request body and password length against a shared bounded worker pool.
- AR-005 — Search guardrails permit large per-request predicate amplification; `COUNT(*)` doubles it; `offset` is unbounded.
- AR-009 — Web-tier credential concentration (THR-024) has no finding of its own and is folded into a dependency finding.
- AR-011 — Demo class definitions, demo permissions in default roles, and the `/auth/rbac-probe` route ship in the production surface.
- AR-012 — Access-token validation requires no `exp`, `iat`, issuer or audience claim.

### Unresolved disagreements

All twelve critiques are open pending Sol iteration 2. The two most likely to remain contested after refinement are AR-006, where the correct disposition depends on evidence neither party currently holds, and AR-007, where the disagreement is about whether two weaknesses with different likelihoods may share one severity.

### Pre-existing weaknesses requiring renewed attention

Full-review mode assigns no change provenance; every weakness discussed exists at the pinned commit. Two categories deserve to stay visible rather than being absorbed into the larger findings:

- The stub-actor-equals-seeded-admin collision (`persistence/actor.py:12`, `seed/users.py:11-12`) is verified and is invoked by `schema/migrate.py:105-115` during migration. Sol folds it into SR-009 alongside direct database authority. It is a distinct, structural, permanent attribution defect and should not disappear behind the broader accountability finding.
- The legacy and `/api/v1` surface duplication is correctly rated Informational today, but AR-002 shows the surfaces already differ in what they disclose: enrichment exists only on v1. Sol's SR-014 describes the surfaces as behaviourally parallel in authorization terms, which is true for the permission check and no longer true for projection content.

## 4. Independent security view

### Relevant attack surfaces and trust boundaries

- **Unauthenticated HTTP to the API (TB-004).** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /`, `GET /health`, and the FastAPI defaults `/docs`, `/redoc`, `/openapi.json`. `main.py:18-28` constructs `FastAPI()` with no `docs_url`, `redoc_url` or `openapi_url` override. `/auth/refresh` and `/auth/logout` are unauthenticated by design and act only on a presented refresh token.
- **Unauthenticated HTTP to the web tier (TB-001).** `/login` loader and action, and the SSR gate on every other route. The login loader performs a redirect to a caller-influenced `next` value when a session already exists.
- **Authenticated API to record data (TB-005).** One `require_class_operation` dependency per route, applied uniformly across create, search, fetch, update and delete in `records/router_factory.py`. `permission_grants` treats `admin` as allow-all.
- **Search compiler to PostgreSQL (TB-006).** `persistence/search.py` — client-controlled projection, predicate tree, sort list, limit and offset, compiled to parameterized SQL against definition-validated identifiers.
- **FK enrichment joins (TB-005/TB-006).** `persistence/fk_enrichment.py` LEFT JOINs the referenced table for every projected FK column, including the injected `created_by` and `updated_by` audit columns, which always target the `user` table.
- **Operator CLI to PostgreSQL (TB-007).** `schema/cli.py` and `seed/cli.py`, both using `persistence/connection.py:database_url()`, the same credential the API runtime uses.
- **Process environment to secrets (TB-008).** `auth/settings.py:15-20` returns a published literal when `UNTANGLED_JWT_SECRET` is unset; `persistence/connection.py:10` returns published credentials when `DATABASE_URL` is unset; the web tier's `require_session_secret()` and `assert_web_auth_config()` genuinely refuse to run without their secrets.
- **Container runtime.** Both final images run as root; no `USER` directive exists in either Dockerfile, and Compose declares no capability drop, read-only filesystem, or `no-new-privileges`.

### Plausible attack chains

1. **Anonymous schema to superuser host execution.** `GET /openapi.json` maps every route and model. If `UNTANGLED_JWT_SECRET` is defaulted, mint an HS256 token for the published admin UUID; if the database port is reachable with defaulted credentials, connect directly instead. The database role is the Compose bootstrap superuser, so the direct-connection branch does not stop at reading data — it reaches `COPY … FROM PROGRAM` and server-side file access. Sol's chain stops at "immediate total compromise" of the application; the host branch is one step further out.
2. **Browser-only operator to database exhaustion.** Under ADR 002 an operator holds no Bearer token, only an `httpOnly` cookie. The list action at `destination_list.tsx:195-244` accepts an arbitrary `predicate` JSON blob and an arbitrary non-negative `offset` from the browser form and forwards both to `POST /api/v1/{collection}/search`. A single form submission can therefore carry roughly two thousand five hundred catastrophic regular expressions, evaluated twice per row, or an offset in the billions. The SSR tier is the confused deputy that makes the API-level attack reachable without ever extracting a token.
3. **Low-privilege reader to operator directory.** With only `incident:read`, project `created_by` and `updated_by` through `POST /api/v1/incidents/search`, page with `total`, and collect the enrichment display values. The result is the display name of every user who has ever created or updated an incident, obtained without `user:read` and without any read being recorded.
4. **Login flood to full-platform denial.** Every route handler in the API is a synchronous `def`, so all of them share one bounded anyio worker pool. Argon2id at library defaults costs 64 MiB per verification. Saturating the pool with concurrent logins for a known-valid username denies the record routes as well as login, and each request also opens its own unpooled connection.
5. **Authenticated session to attacker origin in one click.** `GET /login?next=/\attacker.example/` with an existing session: `safe_next_path` accepts the value, the loader throws `redirect(next)`, and browser URL normalisation resolves the backslash to a protocol-relative reference. This is a shorter path than the cross-origin form post Sol describes.

### Legitimate-user abuse paths

- A holder of `incident:read` reading the whole class, including reclassified security incidents, entirely within granted permissions and with no read record. This is the accepted THR-011 abuse case and Sol's SR-007 states it correctly.
- The same holder harvesting the operator directory through FK enrichment (AR-002) — indistinguishable from rendering a list that shows who raised each ticket, which is exactly what the UI does.
- An operator running a broad `contains` or `regexp` filter from the list chrome and causing the AR-005 amplification without any hostile intent. The code comment at `persistence/search.py:56-58` already anticipates this as performance debt.
- An operator seeding or migrating a real environment and, by doing so, writing the production database password and the effective admin password into a terminal scrollback, a CI log, or a screen share (AR-003).
- An administrator relying on the stub-actor collision to attribute a deliberate action to automation, which remains available because `SEED_ADMIN_ID = STUB_ACTOR_ID`.

### Assumptions independently challenged

| Assumption or decision | Evidence examined | Opus assessment | Consequence |
| --- | --- | --- | --- |
| ASM-007 — secrets come from the customer's secret manager and the product fails closed when they are absent | `auth/settings.py:15-20`, `persistence/connection.py:10-15`, `frontend/app/auth/config.server.ts:6-23`, `session.server.ts:20-28` | Half true and the halves are inverted by tier. The web tier genuinely refuses to start without its secrets; the API silently defaults both its signing secret and its database credentials. The assumption describes intent that the API contradicts | Confirms SR-001 and SR-002; the fail-closed objective is met only where the credential matters least |
| ASM-019 / ASM-025 — record-level authorization is not designed; attribute-level has an intended direction | `rbac/dependencies.py:32-51`, `records/router_factory.py`, `persistence/search.py:137-145` | Accurate for the record and attribute halves, but incomplete for a third case neither assumption names: authorization across a *reference*. FK enrichment already returns content from a class the caller may hold no permission on | AR-002; the intended attribute-level design needs a referenced-class rule, not only an attribute rule |
| ASM-024 — UUID and friendly-id values are provisionally non-sensitive, with FK view inheritance a candidate refinement | `persistence/fk_enrichment.py:69-72, 126-141`, `user.yaml` `display-attribute: display-name` | The candidate refinement is not merely a future nicety. The implemented v1 surface already returns the referenced record's display value, not just its identifier, so the exposure exceeds what the assumption contemplates | AR-002; raises the priority of the recorded refinement |
| ASM-021 / THR-027 — class tiering will bound configuration authority | `backend/class-definitions/` contains no tier marking; `demo-item.yaml` and `demo-link.yaml` sit beside `user.yaml` and `incident.yaml` | Confirmed unbuilt, as the threat model states. Independently, the same directory is already mixing demonstration classes with system and foundation classes, which is the habit the tier model is meant to end | AR-011; the unmarked directory is the practice the tier model must correct |
| TM-020 / Sol SR-011 — a named restore point contributes to recovery | `schema/versions.py:58-66`, `docs/class-definitions.md:279-287` | The caveat is documented honestly by the product: it is a WAL marker, not a backup, and PITR needs base backups and archiving the customer owns. Credit where due. The undrawn consequence is the privilege it demands | AR-001; this is the mechanism that pins the migration role at superuser-equivalent |
| ADR 002 / ASM-023 — the web tier is a candidate customization host | `session.server.ts`, `api.server.ts:65-90`, `login.tsx:39-44` | The concentration THR-028 warns about is verified in code: the SSR process holds the cookie secret, sees every access token, and handles plaintext credentials. Sol substantiated no independent finding for it | AR-009; the host decision needs this as standing evidence |

## 5. Critique method

### Implementation evidence examined

| Evidence | Revision or location | Purpose |
| --- | --- | --- |
| Accepted threat model | Pinned Git object at `f074efd`; SHA-256 verified against manifest | Governing scope, threats, assumptions, and the rating matrix |
| Sol iteration 1 review | `iteration-1/security-review.md`; SHA-256 verified | The artefact under critique |
| Token and session handling | `auth/settings.py`, `auth/tokens.py`, `auth/dependencies.py`, `auth/store.py`, `auth/passwords.py`, `auth/schemas.py`, `auth/routes.py` | Verify SR-001, SR-003, SR-004; test claim requirements, rotation atomicity, and enumeration timing |
| Authorization | `rbac/keys.py`, `rbac/dependencies.py`, `rbac/store.py`, `records/router_factory.py`, `records/deps.py`, `records/locator.py` | Verify SR-007 and SR-014; test for uneven enforcement and mass assignment |
| Search and projection | `persistence/search.py`, `records/search_models.py`, `persistence/fk_enrichment.py` | Verify SR-007 and SR-008; quantify guardrail behaviour; test cross-class disclosure |
| Schema and operator paths | `schema/migrate.py`, `schema/cli.py`, `schema/versions.py`, `persistence/schema.py`, `persistence/connection.py`, `persistence/actor.py`, `seed/cli.py`, `seed/users.py`, `seed/rbac_catalog.py` | Verify SR-002, SR-009, SR-011; test privilege requirements and credential handling |
| Class definitions | `backend/class-definitions/*.yaml` | Establish the shipped class and permission surface, and the `user` display attribute |
| Generated models | `backend/src/untangled/generated/incident.py`, `mapping/system_fields.py` | Test whether writable models permit system-field mass assignment |
| SSR web tier | `frontend/app/auth/*`, `routes/login.tsx`, `routes/logout.tsx`, `routes/authenticated.tsx`, `routes/destination_list.tsx`, `records/search.server.ts`, `records/record_paths.ts`, `shell/nav_paths.ts`, `list/pagination.ts`, `detail/fk_open_related.ts` | Verify SR-005 and SR-006; re-test Sol's XSS and SSRF withdrawals; find the browser-reachable search path |
| Deployment and dependencies | `compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile`, `backend/requirements.lock`, `frontend/package-lock.json`, `docs/class-definitions.md` | Verify SR-002, SR-006, SR-012, SR-013; establish shipped runtime privilege and documented caveats |
| Repository-wide absence checks | `rg` for `statement_timeout`, rate limiting, connection pooling, CORS/middleware registration, `USER` directives, `headers` route exports, security headers, HTML sinks, `SECURITY.md` | Confirm or refute Sol's several "repository search found no …" claims |

### Standards used

| Standard | Specific section or control | Application |
| --- | --- | --- |
| OWASP ASVS 5.0 | V2 Authentication, V3 Session Management, V4 Access Control, V7 Logging and Error Handling, V12 Communication, V14 Configuration | AR-002, AR-003, AR-004, AR-006, AR-011, AR-012 |
| OWASP Top 10:2021 | A01 Broken Access Control, A02 Cryptographic Failures, A05 Security Misconfiguration, A09 Logging Failures | AR-001, AR-002, AR-003, AR-011 |
| RFC 8725 | JWT Best Current Practices, sections 3.1 and 3.9 on validating all claims and constraining algorithms | AR-012 |
| CWE | CWE-250 excessive privilege, CWE-532 credential in log, CWE-863 incorrect authorization, CWE-770 unbounded resource allocation, CWE-1333 inefficient regular expression, CWE-601 open redirect, CWE-613 insufficient session expiration | Critique classification |
| PostgreSQL documentation | `pg_create_restore_point` privilege requirement; `COPY … FROM PROGRAM` superuser/`pg_execute_server_program` requirement; backtracking regular-expression engine | AR-001, AR-005 |
| WHATWG URL Standard | Backslash treated as a path separator during special-scheme URL parsing | AR-007 corroboration and SR-005 validation |
| CIS Docker Benchmark | 4.1 run containers as a non-root user | Corroborates SR-012 |

### Rating basis

Candidate ratings below use the accepted threat model's impact and likelihood definitions and its priority matrix in section 9. Every candidate severity stated is the plain matrix result. No candidate severity in this review is elevated outside the matrix, so the elevation field is `None` throughout. `Informational` is used, consistently with Sol's own convention, for an observation with no substantiated present exploit path. Confidence reflects the strength of the static evidence, not the size of the consequence.

## 6. Critique summary

| Disposition | ID | Critique | Type | Related Sol findings | Candidate severity | Human review |
| --- | --- | --- | --- | --- | --- | --- |
| New | AR-001 | Shared database role is superuser-equivalent by product requirement, escalating database access to host command execution | Missed finding | SR-002, SR-009, SR-011 | High | Yes |
| New | AR-002 | FK identity enrichment discloses referenced-class content with no referenced-class permission check | Missed finding | SR-007, SR-014 | Medium | Yes |
| New | AR-003 | Operator CLIs print the database password and effective seed passwords to standard output | Missed finding | SR-002, SR-009 | Medium | No |
| New | AR-004 | Unbounded login request body and password length against a shared bounded worker pool | Missed finding | SR-003 | High | No |
| New | AR-005 | Search guardrails permit large per-request amplification; mandatory COUNT doubles it; offset is unbounded | Missed finding | SR-007, SR-008 | High | No |
| New | AR-006 | SR-006 narrows an accepted threat-model claim on evidence Sol records as unverified, and omits the API tier | Evidence | SR-006 | Medium | Yes |
| New | AR-007 | SR-005 merges two weaknesses of different likelihood and rates both at the lower one | Rating | SR-005 | Medium | No |
| New | AR-008 | Finding table and coverage table disagree about which forward-looking threats were analysed | Coverage | SR-011, SR-012 | Not applicable | No |
| New | AR-009 | THR-024 web-tier credential concentration has no finding of its own | Coverage | SR-012, SR-004 | Medium | Yes |
| New | AR-010 | Prior accepted-risk table asserts an undocumented tolerance rationale where no tolerance decision exists | Prior acceptance | SR-001 to SR-013 | Not applicable | No |
| New | AR-011 | Demo class definitions, demo permissions in default roles, and `/auth/rbac-probe` ship in the production surface | Missed finding | SR-010 | Informational | No |
| New | AR-012 | Access-token validation requires no `exp`, `iat`, issuer or audience claim | Missed finding | SR-001, SR-004 | Low | No |

This table is derived from the detailed critique records, which are authoritative.

## 7. Detailed critiques

### AR-001 — Shared database role is superuser-equivalent by product requirement

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-002, SR-009, SR-011
- Related threats: THR-002, THR-014, THR-020, THR-021
- Related security requirements: None
- Candidate impact: Critical
- Candidate likelihood: Medium
- Candidate severity: High
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

SR-009 claims that "One database credential supports application, migration, seed, and direct SQL authority" and recommends separating "runtime, migration, seed, and human database roles". SR-002 states that the database default-credential route yields "complete data compromise bypassing the application entirely". Neither finding examines what privilege level that single role actually holds.

#### Opus challenge

The role is not merely shared, it is superuser-equivalent, and the product requires it to be. Every applied migration calls `pg_create_restore_point`, whose execution PostgreSQL restricts to superusers unless `EXECUTE` is explicitly granted. The shipped default credential is the Compose bootstrap role, which the `postgres` image creates as a superuser, and the code's own docstring says so.

Two consequences follow that Sol does not draw. First, SR-002's impact is understated: with a superuser role, an attacker holding database access is not confined to reading and writing data. `COPY … FROM PROGRAM` executes shell commands as the database operating-system user, and `pg_read_server_files` reads arbitrary files. That is host compromise of the database container, not data compromise. Second, SR-009's recommendation is not achievable for the migration role as the product stands: a least-privilege migration role will make `migrate` fail at `create_restore_point` unless the customer knows to grant `EXECUTE`. Because the runtime shares the same `DATABASE_URL`, the practical effect is that the application process also runs as a superuser.

Credit where it is due: this is documented honestly. `schema/versions.py:58-66` and `docs/class-definitions.md:279-287` both state the privilege requirement and that a restore point is not a backup. The gap is that the security consequence of that documented requirement is not drawn anywhere, and Sol reproduced the omission.

#### Evidence

- `backend/src/untangled/schema/versions.py:58-66` — `create_restore_point` executes `SELECT pg_create_restore_point(%s)`; the docstring states "Requires a role permitted to call `pg_create_restore_point` (superuser or equivalent). Local compose `untangled` is a superuser".
- `backend/src/untangled/schema/migrate.py:100-103` — `create_restore_point` is called unconditionally on every non-empty plan, before any DDL.
- `backend/src/untangled/persistence/connection.py:10-20` — `DEFAULT_DATABASE_URL = "postgresql://untangled:untangled@127.0.0.1:5432/untangled"`; `connect()` is the single entry point.
- `backend/src/untangled/auth/dependencies.py:21-27` — the API runtime obtains its per-request connection from the same `connect()`.
- `backend/src/untangled/schema/cli.py:54` and `backend/src/untangled/seed/cli.py:27` — both CLIs use the same `connect()`.
- `compose.yaml:6-11` — `POSTGRES_USER: untangled`, which the `postgres` image provisions as the bootstrap superuser, and `ports: "5432:5432"` publishes it.
- `docs/class-definitions.md:279-287` — documents the privilege requirement and the "not a backup" caveat.
- PostgreSQL documentation: `COPY … FROM PROGRAM` requires superuser or `pg_execute_server_program`; a superuser holds it implicitly.

#### Attack path or disconfirming path

1. An operator deploys without overriding `DATABASE_URL`, or copies the Compose credentials, and the database port is reachable — the SR-002 precondition, unchanged.
2. The attacker connects as `untangled`, which is a superuser.
3. Instead of stopping at `SELECT * FROM "user"`, the attacker issues `COPY tmp FROM PROGRAM 'sh -c "…"'` and executes commands as the database operating-system user, or reads server files with `pg_read_server_files`.
4. Disconfirming path: if a customer provisions a non-superuser role for the runtime and grants `EXECUTE ON FUNCTION pg_create_restore_point` only to a separate migration role, the escalation disappears. Nothing in the product requires, checks, or documents that split, and the shipped default does the opposite.

#### Legitimate-user abuse case

An infrastructure operator (ACT-005) already has this reach legitimately, which is THR-014. The new element is that the *application process* holds it too, so a compromise of the API — through THR-021's dependency path, for instance — inherits superuser database authority rather than the application's data authority.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: `docs/class-definitions.md` records the privilege requirement as an operational caveat, not as a security decision
- Current applicability: Rationale undocumented — the operational caveat exists, the security consequence has never been assessed

#### Requested resolution

Sol iteration 2 should determine and record: the actual privilege level the shipped and documented default database role holds; whether any product path other than `pg_create_restore_point` requires elevated database privilege; whether SR-002's impact justification should be restated as host command execution rather than data compromise; and whether SR-009's role-separation recommendation is achievable without a product change to make the restore point optional or independently privileged. If Sol concludes the escalation is real, it should state whether that changes SR-002's rating (I assess it does not — SR-002 is already Critical — but it materially changes the recovery and blast-radius reasoning).

#### Final adversarial position

Pending Sol refinement.

### AR-002 — FK identity enrichment discloses referenced-class content with no referenced-class permission check

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-007, SR-014
- Related threats: THR-011, THR-012, THR-026
- Related security requirements: None
- Candidate impact: Low
- Candidate likelihood: High
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

SR-007 states that "Authorization checks only `{class}:read`" and that a holder "can project any field". Its scope is the requested class: rows and attributes of the class named in the route. SR-014 describes the legacy and v1 surfaces as sharing "the same factory and dependency" with no substantiated authorization divergence.

#### Opus challenge

The exposure crosses a class boundary, and Sol's framing does not reach it. On the versioned surface, every projected foreign-key column — including the injected audit columns `created_by` and `updated_by`, which always target `user` — is LEFT JOINed to the referenced table and the referenced record's display attribute is returned. `user.yaml` sets `display-attribute: display-name`. There is no permission check of any kind against the referenced class.

Concretely, a principal holding only `incident:read` — the seeded `incident-read-only` role is exactly this — can `POST /api/v1/incidents/search` with `attributes: ["created_by","updated_by"]` and receive the display name of every user who has created or updated an incident, paging with `total` until the directory is exhausted. No `user:read` permission exists in the seeded catalogue at all, so this is not a case of a check being missed; it is content from a class outside the authorization model being returned by a route inside it.

This also refines SR-014. Sol's claim that the two surfaces are behaviourally parallel is true for the permission check and false for projection content: enrichment exists only on v1. That is a live divergence in what the surfaces disclose, not the future divergence SR-014 anticipates.

I am rating this Low impact deliberately. Today the disclosed content is display names of users the caller can already infer from the tickets they may legitimately read, and the seeded display names are not usernames. The severity comes from the likelihood — the behaviour is unconditional on the default read path — and from the direction of travel: the same mechanism will enrich FKs into CMDB and integration-credential classes (AST-005, AST-012), where the referenced content is the highest-value asset in the model. ASM-024 already names FK view inheritance as a candidate refinement; this shows it is not a refinement to a hypothetical, it is a gap in shipped code.

#### Evidence

- `backend/src/untangled/persistence/fk_enrichment.py:69-72` — `resolve_fk_fields` unconditionally appends `("created_by", "user")` and `("updated_by", "user")` whenever those columns are projected.
- `backend/src/untangled/persistence/fk_enrichment.py:126-141` — the display and friendly columns of the target class are added to the SELECT list.
- `backend/src/untangled/persistence/fk_enrichment.py:149-158` — a LEFT JOIN to the referenced table is emitted per FK.
- `backend/src/untangled/records/router_factory.py:85-91, 160-166` — the only authorization dependency on the enriched routes is `require_class_operation(class_kebab, "read")` for the *requested* class.
- `backend/class-definitions/user.yaml` — `display-attribute: display-name`, and the class also carries `username` and `password-hash` attributes that are not the display attribute today.
- `backend/src/untangled/seed/rbac_catalog.py:19-23, 137-138` — the permission catalogue covers `demo-item`, `incident` and `change-request` only; no `user` permission exists, and the `incident-read-only` role holds exactly `incident:read`.
- `backend/src/untangled/persistence/search.py:137-145` — `searchable_attributes` includes the injected system fields, so `created_by` and `updated_by` are always projectable.

#### Attack path or disconfirming path

1. Authenticate as a principal holding only `incident:read`.
2. `POST /api/v1/incidents/search` with `{"attributes":["created_by","updated_by"],"limit":200,"offset":0}`.
3. Each item returns identity objects carrying the referenced user's `display_name`; page using `total`.
4. Disconfirming path examined and rejected: `map_enriched_row` returns only the display and friendly values, never `password_hash` or `username`, and the enriched columns cannot be used in predicates or sort keys — `_column_ref` and `_resolve_sort` resolve against source columns only. The exposure is therefore projection-only, which is why I rate impact Low rather than higher.

#### Legitimate-user abuse case

This is the abuse case, in the same sense as THR-011. Rendering "raised by" on a ticket list is the intended product behaviour; the identical request with a wide page size and full pagination is directory harvesting. The platform cannot distinguish them, and nothing records the read.

#### Prior decision or acceptance

- Decision reference: ASM-024
- Recorded rationale: identifiers are provisionally non-sensitive; the human has qualified this as possibly premature, with FK attributes inheriting view permission from the referenced class named as a candidate refinement
- Current applicability: Conditions changed — the assumption reasons about identifier values, while the implemented surface returns referenced-record *content*, which is a broader exposure than the assumption contemplates

#### Requested resolution

Sol iteration 2 should record this as a finding in its own right or explain why it belongs inside SR-007, and should state: which classes are reachable through enrichment today; whether any reachable target class carries content more sensitive than a display name; whether SR-014's parity claim needs correcting given that enrichment exists only on v1; and what the minimal control is — I suggest requiring `{referenced_class}:read` before enriching, degrading to the bare identifier otherwise, which is the smallest change consistent with ASM-025's indistinguishability principle.

#### Final adversarial position

Pending Sol refinement.

### AR-003 — Operator CLIs print the database password and effective seed passwords to standard output

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-002, SR-009
- Related threats: THR-002, THR-014, THR-017
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Medium
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-002's detective-control line states that "seed output exposes which source was used, but no durable security event is recorded", and its evidence line describes `seed/cli.py:24-39` as seeding "without a production guard and prints the effective plaintext default".

#### Opus challenge

The description is inaccurate in a way that hides a separate weakness. The seed CLI does not print "the effective plaintext default" — it prints `password_for(seed)`, which returns the environment override when one is set. An operator who correctly follows the documented practice of supplying `SEED_ADMIN_PASSWORD` for a real deployment has that production password written to standard output. The conspicuous `-change-me` naming that Sol counts as a preventive control does not apply to that value.

Separately and unmentioned by either finding, both operator CLIs print the complete connection string. `database_url()` returns the full URL including the password, and both `schema/cli.py` and `seed/cli.py` print it as their first line of output. In the shipped default that discloses `untangled:untangled`, which is already public; with a real `DATABASE_URL` it discloses the production database password to the terminal, to any CI job log that runs `make migrate`, and to a screen share.

This is a distinct weakness class from SR-002's default credentials — it is credential disclosure through logging, and it survives every fix SR-002 recommends. Generating unique bootstrap credentials, as SR-002 proposes, makes it worse rather than better, because the generated secret would then be printed.

#### Evidence

- `backend/src/untangled/seed/cli.py:26` — `print(f"seed: database={database_url()}")`.
- `backend/src/untangled/seed/cli.py:34-39` — prints, for every seed principal, `password from {seed.password_env} or default {password_for(seed)!r}`.
- `backend/src/untangled/seed/users.py:75-77` — `password_for` returns `os.environ.get(seed.password_env, seed.default_password)`, so an operator-supplied value is what gets printed.
- `backend/src/untangled/schema/cli.py:51` — `print(f"migrate: database={database_url()}")`.
- `backend/src/untangled/persistence/connection.py:13-15` — `database_url()` returns the raw URL, password included, with no redaction helper anywhere in the module.

#### Attack path or disconfirming path

1. An operator runs `make migrate` and `make seed` against a real environment from a CI job or an operator workstation, with `DATABASE_URL` and `SEED_ADMIN_PASSWORD` correctly supplied.
2. Both secrets are written to the job log or terminal scrollback in cleartext.
3. Anyone with read access to CI logs — typically a much larger population than the secret store's readers — recovers the production database password and the administrator password.
4. Disconfirming path examined and rejected: no redaction function exists in `persistence/connection.py`, no logging framework with a scrubbing filter is configured anywhere in the backend, and the prints are unconditional with no verbosity flag.

#### Legitimate-user abuse case

An operator pastes the output of a failed `make migrate` into a ticket or chat to ask for help, disclosing the production database password to everyone who can read that incident — which, under THR-011's class-wide RBAC, is everyone holding `incident:read`.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None
- Current applicability: Not applicable

#### Requested resolution

Sol iteration 2 should correct SR-002's evidence line to state that the effective, possibly production, password is printed rather than the default, and should record the `DATABASE_URL` disclosure — which appears in two CLIs — as an explicit weakness with its own recommendation. The minimal control is a redacting formatter applied wherever a connection string or password is surfaced, plus removing the per-principal password echo entirely; the CLI can confirm which environment variable was consulted without printing the value.

#### Final adversarial position

Pending Sol refinement.

### AR-004 — Unbounded login request body and password length against a shared bounded worker pool

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-003
- Related threats: THR-003, THR-004
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: Medium
- Candidate severity: High
- Rating elevation: None
- Confidence: Medium
- Human review required: No

#### Sol position

SR-003 claims that "Anonymous callers can make unlimited login attempts" and that this enables "CPU/memory exhaustion", recommending "product-level, failure-safe per-account and per-source throttling with global concurrency shedding" plus a dummy hash. Its uncertainty note says saturation thresholds were not measured, which "affects capacity planning, not the presence of the unbounded work path".

#### Opus challenge

Three mechanisms that change both the cost per request and the reach of the denial are absent from the analysis, and the third undermines the recommendation's claim to be minimal and effective.

The first is that the request itself is unbounded. `OAuth2PasswordRequestForm` parses a URL-encoded body with no size limit configured at any layer: Starlette applies none by default for URL-encoded bodies, and the Uvicorn command line in `backend/Dockerfile` sets none. A single unauthenticated request can therefore ask the server to buffer an arbitrarily large body.

The second is that the password field is likewise unbounded, and the Argon2 verification hashes the whole of it. Sol's dummy-hash recommendation actually widens this: performing a fixed verification for unknown users means an attacker who supplies an enormous password and a nonexistent username gets the work done anyway, where today the early return in `authenticate_user` avoids it. That is a case where the proposed control interacts badly with an unexamined input bound, and it should be paired with a password-length cap rather than added alone.

The third is the one that changes the blast radius. Every route handler in the API is a synchronous `def` — login, search, fetch, create, update, delete — so FastAPI dispatches all of them into the same bounded anyio worker thread pool. Argon2id at `PasswordHasher()` defaults costs 64 MiB and several CPU-seconds-equivalent per verification. Saturating that pool with concurrent logins does not merely make login slow; it makes every authenticated record route unavailable, because they are queued behind the same threads. Sol's SR-003 impact justification says "resource exhaustion disrupts the incident-management service", which happens to be the right conclusion, but it is reached without identifying the shared pool that causes it — and consequently the recommendation asks for throttling and shedding without asking for isolation of the hashing path from the request-serving path, which is what THR-004's control-gap list actually calls for.

I hold confidence at Medium: the mechanisms are certain from the code, the resulting thresholds are not, and I ran no load test.

#### Evidence

- `backend/src/untangled/auth/routes.py:42-52` — `def login(...)`, a synchronous handler, therefore threadpool-dispatched.
- `backend/src/untangled/records/router_factory.py:47, 85, 160, 180, 200` — `create_record`, `search_records`, `fetch_record`, `update_record` and `delete_record` are all synchronous `def` handlers sharing the same pool.
- `backend/src/untangled/auth/passwords.py:8` — `_hasher = PasswordHasher()` with library defaults; `argon2-cffi==25.1.0` in `backend/requirements.lock` defaults to a 64 MiB memory cost.
- `backend/src/untangled/auth/store.py:55-62` — `authenticate_user` returns before verification for unknown or inactive users, which is both the SR-003 timing side channel and the current accidental protection against oversized-password work.
- `backend/Dockerfile:27` — `uvicorn untangled.main:app --host 0.0.0.0 --port 8000`, with no `--limit-concurrency`, no worker count, and no body-size setting.
- `backend/src/untangled/main.py:18-34` — no middleware of any kind is registered other than the validation exception handler; a repository-wide search for `add_middleware` returns nothing.

#### Attack path or disconfirming path

1. An unauthenticated attacker issues concurrent `POST /auth/login` requests for a known-valid username — `admin` is published — each carrying a very large `password` field.
2. Each request buffers its body and then performs a full Argon2id verification, occupying one worker thread and 64 MiB for the duration.
3. Once the pool is saturated, every synchronous record route is queued behind the hashing work, so authenticated operators lose the platform, not just the login page.
4. Disconfirming path examined and rejected: no rate limiter, concurrency cap, body-size limit, or middleware exists anywhere in the backend; a repository-wide search confirms Sol's own negative result and extends it to middleware and Uvicorn limits.

#### Legitimate-user abuse case

None meaningful; this is an unauthenticated path, matching THR-004's own assessment.

#### Prior decision or acceptance

- Decision reference: ASM-006
- Recorded rationale: rate limiting and lockout belong in the product rather than a reverse proxy, tracked as issue #33; the assumption explicitly warns that a login-only implementation would leave THR-004 untouched
- Current applicability: Still supported as intent, and the warning it contains is precisely the gap this critique identifies in SR-003's recommendation

#### Requested resolution

Sol iteration 2 should extend SR-003's mechanism to include the unbounded request body, the unbounded password length, and the shared synchronous worker pool; should state explicitly that adding a dummy verification without a password-length bound increases the unauthenticated work available to an attacker; and should revise the minimal recommendation to pair throttling with a password-length cap, a request-body limit, and isolation or a concurrency cap specific to the hashing path.

#### Final adversarial position

Pending Sol refinement.

### AR-005 — Search guardrails permit large per-request amplification, and COUNT doubles it

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-007, SR-008
- Related threats: THR-012, THR-013
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: High
- Candidate severity: High
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-008 states that "Result, nesting, and list bounds exist … but they bound output/shape rather than database work", and rates likelihood Medium because the attack "requires an authenticated reader and actual cost varies by data/pattern". SR-007 notes limit 200 and arbitrary offset as extraction aids.

#### Opus challenge

Sol's statement that the bounds do not constrain database work is correct but understates the position by a wide margin: the bounds define an amplification factor, and it is large.

`_compile_predicate` rejects only depth greater than three, and `_compile_logical_list` permits fifty children per logical node. Root at depth one, children at depth two, grandchildren at depth three — leaves are legal at depth three. A single request may therefore carry on the order of two thousand five hundred `regexp` leaves. Because `OR` only short-circuits when a branch matches, a set of deliberately non-matching catastrophic patterns is evaluated in full for every row.

That work is then done twice. `execute_search` compiles the predicate a second time for an unconditional `SELECT COUNT(*) FROM {table} WHERE {predicate}` and executes it before the paged SELECT. The COUNT cannot benefit from `LIMIT`, so the 200-row cap that Sol lists as a preventive control provides no protection at all against predicate cost — the predicate is evaluated against the entire class regardless.

A third amplifier is unmentioned by either finding: `offset` has no upper bound. `SearchRequest` constrains it with `ge=0` only and `_resolve_offset` rejects only negatives, so a caller may request `offset: 100000000` and force PostgreSQL to produce and discard that many sorted rows.

These change the likelihood assessment. Sol rates Medium partly on "actual cost varies by data/pattern"; with a two-thousand-five-hundred-fold per-request multiplier applied twice, a single request is a plausible outage rather than a request that must be repeated at volume, and the prerequisite is one ordinary read permission. I assess likelihood High. The matrix result is unchanged at High because impact was already High, but the change matters for the recommendation: a `statement_timeout` alone caps one query and does not stop an attacker issuing many, so the timeout needs to be paired with a predicate-count or pattern-count bound.

One further reachability point Sol does not make: under ADR 002 an operator holds no Bearer token, so "an authenticated reader" sounds like it needs a token the operator does not have. It does not. The list action forwards an arbitrary `predicate` JSON blob and an arbitrary non-negative `offset` from a browser form straight through to the API, so an ordinary browser session is sufficient.

#### Evidence

- `backend/src/untangled/persistence/search.py:27-28` — `MAX_SEARCH_NESTING_DEPTH = 3`, `MAX_SEARCH_NESTING_LENGTH = 50`.
- `backend/src/untangled/persistence/search.py:354-357` — the depth guard raises only when `depth > 3`, so leaves at depth three are accepted.
- `backend/src/untangled/persistence/search.py:426-436` — each logical node accepts up to fifty children, and children are compiled at `depth + 1`.
- `backend/src/untangled/persistence/search.py:172-179` — the COUNT query is compiled from the same predicate and is unconditional.
- `backend/src/untangled/persistence/search.py:232-239` — the COUNT is executed before the paged SELECT on every search.
- `backend/src/untangled/persistence/search.py:568-570` — `regexp` places the client pattern directly into `{column} ~ %s`.
- `backend/src/untangled/records/search_models.py:57` — `offset: int | None = Field(default=None, ge=0)`, with no upper bound.
- `backend/src/untangled/persistence/search.py:274-281` — `_resolve_offset` rejects only negative values.
- `backend/src/untangled/persistence/search.py:302-326` — `_resolve_sort` validates each attribute name but places no bound on the number of sort keys, and does not deduplicate them.
- `frontend/app/routes/destination_list.tsx:199-222` — the list action forwards the browser-supplied predicate and paging values into `run_list_search`.
- `frontend/app/list/pagination.ts:154-187` — `parse_paging_form_values` clamps `limit` to the four per-page options but accepts any non-negative safe integer offset.

#### Attack path or disconfirming path

1. Authenticate with any single class read permission, or simply hold a browser session on a list page.
2. Submit one search whose predicate is an `and` of fifty `or` nodes, each holding fifty `regexp` leaves targeting a `multiline-text` column with a pattern crafted to backtrack and never match.
3. PostgreSQL evaluates the full predicate for every row of the class, once for `COUNT(*)` and once for the paged `SELECT`.
4. Repeat concurrently, or substitute a very large `offset` to force sorted-row production and discard.
5. Disconfirming path examined and rejected: repository-wide search confirms no `statement_timeout`, no connection pool, no query-cost estimation, and no per-principal budget. `_escape_like_literal` correctly neutralises LIKE metacharacters for the non-regexp operators, which bounds those to sequential scans rather than backtracking — a real partial mitigation that applies only to `contains`, `starts-with` and `ends-with`, not to `regexp`.

#### Legitimate-user abuse case

`_resolve_sort`'s lack of a key-count bound and the unbounded offset are both reachable by ordinary UI use at scale, and the code comment at `persistence/search.py:56-58` already records pattern filters on long text as known performance debt. An operator paging deep into a large incident list produces the offset cost without any intent.

#### Prior decision or acceptance

- Decision reference: THR-013 open question in TM-REV-001 section 15
- Recorded rationale: the human considers `regexp` worth keeping, so the answer must be mitigation rather than removal; candidates named are `EXPLAIN`-based cost analysis, static pattern analysis, and gating the operator behind access control
- Current applicability: Still supported as a direction; this critique adds that whichever mitigation is chosen must also bound predicate *count*, because per-request multiplication is a separate lever from per-pattern cost

#### Requested resolution

Sol iteration 2 should quantify the per-request predicate multiplier from the code's own constants, state that the mandatory `COUNT(*)` evaluates the predicate a second time over the full class and therefore nullifies the 200-row cap as a work bound, record the unbounded `offset` and unbounded sort-key count, revisit SR-008's Medium likelihood in light of single-request sufficiency, and extend the recommendation beyond a statement timeout to include a total-predicate-count bound and an offset ceiling.

#### Final adversarial position

Pending Sol refinement.

### AR-006 — SR-006 narrows an accepted threat-model claim on evidence Sol records as unverified

- Iteration disposition: New
- Critique type: Evidence
- Related Sol findings: SR-006
- Related threats: THR-009, THR-023
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Medium
- Candidate severity: Medium
- Rating elevation: None
- Confidence: Medium
- Human review required: Yes

#### Sol position

Sol's executive summary states that "The authenticated layout does set `Cache-Control: private, no-store` (`frontend/app/routes/authenticated.tsx:36-39`), so the broader header finding does not repeat the threat model's earlier claim that no authenticated cache control exists." SR-006 repeats this as disconfirming evidence and lists "authenticated loader requests private/no-store caching" as a preventive control. Section 14 then records, in tension with both, that "Loader-level no-store exists; final document/data behavior was not runtime captured".

#### Opus challenge

The report narrows an accepted threat-model claim using evidence it elsewhere concedes it does not have, and the code contains a specific reason to doubt the narrowing.

In React Router v7 framework mode, headers attached through `data()` in a loader govern the data-request response. Headers on the SSR *document* response are produced by a route's `headers` export. No route in this repository exports `headers` — a repository-wide search returns only the single `data()` call in `authenticated.tsx` and the unit assertion in `route_wiring.test.ts` that inspects the loader's returned object rather than an HTTP response. So the one piece of evidence Sol offers is a unit-level assertion about a value, not a demonstration that any browser ever receives the header on a rendered page.

Two further gaps make the narrowing weaker still, and neither is mentioned. The header, if it propagates at all, is attached to the `authenticated` layout loader only — the login document and any route whose loader does not call `data()` with headers are unaffected. And SR-006 is scoped entirely to the SSR tier: the FastAPI application registers no middleware at all, so every API response carries no `Cache-Control`, no `X-Content-Type-Options`, and no other security header. Compose publishes port 8000 to the host, and the threat model's TB-003 records Bearer traffic crossing the deployment network in cleartext, so API responses containing incident content are not a purely internal concern.

I am not asserting that the header definitively fails to reach the document. I am asserting that Sol cannot currently support the claim that it does, and that a security review should not narrow accepted intent on that basis. The honest disposition is the one Sol already wrote in section 14; the executive summary and SR-006 should match it.

#### Evidence

- `frontend/app/routes/authenticated.tsx:36-39` — the sole `Cache-Control` assignment, made through `data(..., { headers })` in a layout loader.
- Repository-wide search of `frontend/` for `export function headers` returns no matches; the only two `Cache-Control` occurrences are the loader call above and `frontend/app/auth/route_wiring.test.ts:91`.
- `frontend/app/auth/route_wiring.test.ts:91` — asserts the header on the loader's returned object, not on an HTTP response from a built server.
- `frontend/app/routes/login.tsx` — no cache-control on the unauthenticated login document.
- `backend/src/untangled/main.py:18-34` — no `add_middleware` call anywhere in the backend; a repository-wide search for `add_middleware` returns nothing, so no API response carries security or cache headers.
- `compose.yaml:31-32` — the API port is published to the host.
- Sol's own `security-review.md:1289` — "Loader-level no-store exists; final document/data behavior was not runtime captured".

#### Attack path or disconfirming path

1. An authenticated SSR document containing incident content traverses a shared forward proxy or CDN in the customer's network path.
2. If the document response carries no `Cache-Control`, the intermediary may store it and later serve another operator's content — the original THR-009 concern.
3. Disconfirming path: build the web tier, issue an authenticated request to `/incidents/lists/<id>`, and capture the raw document response headers. If `Cache-Control: private, no-store` is present on the document, Sol's narrowing is correct for that route and the critique reduces to the login document and the API tier. If it is absent, THR-009 stands unnarrowed.

#### Legitimate-user abuse case

None identified. Cache exposure depends on the customer's network path rather than on any user capability, and framing and injection containment — the other halves of THR-009 — are not user-driven either.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list; THR-009 in TM-REV-001
- Recorded rationale: ADR 002 explicitly leaves open "whether `Cache-Control: private, no-store` should be systemic", and THR-009 records the absence of systemic headers as a control gap
- Current applicability: Still supported — the accepted position is that the systemic question is open, which is precisely what Sol's narrowing would close without evidence

#### Requested resolution

Sol iteration 2 should either produce document-level evidence — a captured response from a built server, or a route `headers` export demonstrating propagation — or withdraw the disconfirmation from both the executive summary and SR-006 and restore THR-009's claim in full. Independently of that outcome, SR-006 should be extended to cover the API tier's complete absence of security and cache headers, which is not affected by the SSR question either way.

#### Final adversarial position

Pending Sol refinement.

### AR-007 — SR-005 merges two weaknesses of different likelihood and rates both at the lower one

- Iteration disposition: New
- Critique type: Rating
- Related Sol findings: SR-005
- Related threats: THR-008
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Medium
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-005 combines login CSRF and the `safe_next_path` backslash bypass in one record rated Low, with impact Medium and likelihood Low, justified as "It requires user interaction and account confusion; visible identity chrome may reveal the wrong account".

#### Opus challenge

First, credit: the backslash bypass is a genuine finding, it is not described in TM-REV-001, and I confirmed it independently by reading the guard against the WHATWG URL Standard's treatment of backslash as a path separator under special schemes. `safe_next_path` tests `startsWith("/")`, `startsWith("//")` and `includes("://")`; `/\evil.example/path` passes all three and normalises to `https://evil.example/path`. That is well found and well evidenced.

The rating is the problem. The two weaknesses in the record have materially different likelihoods, and the merged record adopts the lower one. Sol's likelihood justification — user interaction plus account confusion plus visible identity chrome — is a fair description of the login-CSRF half. None of it applies to the open redirect. The redirect needs no account confusion, no attacker credentials, and no hostile page: it needs one crafted link to the customer's own legitimate domain, which is exactly what makes open redirects valuable for phishing. Under the accepted matrix, Medium impact with Medium likelihood is Medium, not Low.

Second, the recorded attack path is not the cheapest one. Sol describes the victim submitting the login form or following "a crafted login URL carrying an encoded backslash `next`". The login *loader* is more direct: when a session already exists, `GET /login?next=/\attacker.example/` redirects immediately, with no form submission and no authentication step. For an operator who is already signed in — the normal state during a working day — this is a single click. Sol's own recommendation happens to cover both paths, so the correction is to the likelihood reasoning and the attack path, not to the remedy.

#### Evidence

- `frontend/app/auth/next_path.ts:12` — `if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://"))`; `/\evil.example/path` satisfies none of the rejection conditions.
- `frontend/app/routes/login.tsx:16-24` — the loader calls `safe_next_path` on the `next` query parameter and, when a token is present, executes `throw redirect(next)` with no further validation.
- `frontend/app/routes/login.tsx:30, 42-44` — the action path Sol describes, which also redirects to the unvalidated value.
- `frontend/app/auth/gate.server.ts:9-15` — `login_redirect_url` percent-encodes the destination when constructing the login URL, which protects the gate's own generated links but does nothing about an attacker-supplied query parameter.
- `frontend/app/auth/auth.test.ts:8-21` — covers absolute and protocol-relative URLs; no backslash case, confirming Sol's evidence.
- WHATWG URL Standard: for special schemes, `\` is treated as `/` during parsing, so `/\host` resolves as `//host`.

#### Attack path or disconfirming path

1. An operator with a live session receives a link to the genuine deployment: `https://untangled.customer.example/login?next=%2F%5Cattacker.example%2Flogin`.
2. The login loader finds a session, `safe_next_path` accepts the value, and the browser is redirected to `https://attacker.example/login`.
3. The operator, having started from the real domain, is presented with a credential-harvesting page.
4. Disconfirming path examined and rejected: the session cookie is host-scoped and is not transmitted to the external origin, so this is phishing and misdirection rather than credential capture — which is why impact remains Medium rather than higher.

#### Legitimate-user abuse case

None identified beyond Sol's own observation that an account holder could deliberately induce another operator to work in the wrong session.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list, carried to issue #67
- Recorded rationale: ADR 002 names login CSRF explicitly as deferred; the redirect-normalisation defect is not covered by any prior decision
- Current applicability: Still supported for the CSRF half; Not applicable to the redirect half, which no prior decision considered

#### Requested resolution

Sol iteration 2 should split SR-005 into its two constituent weaknesses, or retain one record and rate it at the higher of the two matrix results with both likelihood justifications shown; should add the authenticated loader path to the attack path; and should state which half drives the final severity so consolidation is not left inferring it.

#### Final adversarial position

Pending Sol refinement.

### AR-008 — Finding table and coverage table disagree about which forward-looking threats were analysed

- Iteration disposition: New
- Critique type: Coverage
- Related Sol findings: SR-011, SR-012
- Related threats: THR-018, THR-019, THR-025, THR-027, THR-028
- Related security requirements: None
- Candidate impact: Not applicable
- Candidate likelihood: Not applicable
- Candidate severity: Not applicable
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

Sol's finding summary links SR-011 to "THR-020, THR-027" and SR-012 to "THR-019, THR-021, THR-024". Its threat-coverage table records THR-019 as "Insufficient evidence | SR-012 | Sandbox/host not implemented" and THR-027 as "Insufficient evidence | SR-011 | Control not designed/implemented".

#### Opus challenge

The two tables tell a consolidator different things, and the coverage table is the accurate one. SR-011 analyses `persistence/schema.py`'s permissive `apply_schema` default and `sync_table`; it does not analyse anything about tier identity, prefix normalisation, enforcement at load versus at migrate, or additive-only semantics, which is the entire substance of THR-027. SR-012 analyses lockfile hashing, SBOM absence and root-running containers; it does not analyse isolation models, host bridges, resource budgets, egress policy, or handler identity, which is the substance of THR-019.

Because the finding table is what a reader scans first, the current presentation implies that the customization sandbox and tier enforcement received analysis. They received none, correctly, because nothing is implemented. Sol's own scope limitation says exactly this: "Forward-looking surfaces have no implementation to trace; conclusions about them are coverage gaps or low-confidence control dependencies". The finding table contradicts that limitation.

The same pattern, less severely, affects THR-018, THR-025 and THR-028, which have no finding at all and are correctly marked "Insufficient evidence" — those rows are honest and need no change. The fix is to stop attributing THR-019 and THR-027 to findings that do not address them, and instead carry them into section 14 as coverage gaps alongside the others.

This is an accounting critique, not a security one. It carries no candidate severity, but it will distort consolidation's "unaccounted source items" reconciliation if left as is.

#### Evidence

- Sol `security-review.md:139-140` — the finding table rows linking SR-011 to THR-027 and SR-012 to THR-019.
- Sol `security-review.md:1210, 1218` — the coverage table rows marking THR-019 and THR-027 "Insufficient evidence".
- Sol `security-review.md:900-950` — SR-011's claim, evidence and recommendation, which concern migration helpers and contain no tier-mechanism analysis.
- Sol `security-review.md:972-1024` — SR-012's claim and evidence, which concern dependency pinning and container users and contain no sandbox analysis.
- Sol `security-review.md:57` — the scope limitation that forward-looking surfaces yield coverage gaps rather than findings.
- `backend/class-definitions/` — no tier marking of any kind exists, confirming that there is nothing implemented for SR-011 to have analysed.

#### Attack path or disconfirming path

Not applicable; this concerns the accuracy of the report's own accounting rather than a system weakness.

#### Legitimate-user abuse case

Not applicable.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None
- Current applicability: Not applicable

#### Requested resolution

Sol iteration 2 should reconcile the two tables: remove THR-019 from SR-012's related threats and THR-027 from SR-011's, or expand those findings to actually address the threats claimed. Whichever direction is chosen, THR-018, THR-019, THR-025, THR-027 and THR-028 should all appear consistently as coverage gaps in section 14 so consolidation can account for them as design-stage items rather than as analysed surfaces.

#### Final adversarial position

Pending Sol refinement.

### AR-009 — THR-024 web-tier credential concentration has no finding of its own

- Iteration disposition: New
- Critique type: Coverage
- Related Sol findings: SR-012, SR-004, SR-006
- Related threats: THR-024, THR-021, THR-028
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: Low
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

Sol's coverage table records THR-024 as "No independent issue substantiated | SR-012 | Requires prior web-tier compromise". SR-012's evidence line notes that "the SSR process holds the session secret and every active Bearer token in flight", but SR-012 is a supply-chain and container-privilege finding whose recommendation is about hash pinning, SBOMs and non-root users.

#### Opus challenge

The conclusion that no *independent* issue exists is defensible, since THR-024 is a blast-radius observation requiring a prior compromise, and the accepted model says as much. What is not defensible is where the observation ends up. Folding it into a dependency finding means the verified facts about the web tier's credential custody are recorded only as an aside inside a recommendation about lockfiles, and consolidation will find no record that anyone confirmed them.

The facts are verified and they matter to a decision that is still open. The SSR process holds the cookie signing secret; every access token passes through it; and the login action handles the plaintext username and password in that same process before forwarding them to the API. TM-REV-001's THR-028 names the web tier as one of three candidate hosts for customer-authored customization and calls it "the worst available option" precisely because of this concentration. A security review of the implemented system is the natural place to confirm that the concentration is real in code, and Sol's report does confirm it — but only as evidence for a different finding, with no rating, no recommendation and no coverage entry pointing to it.

Sol also credits a control that partly holds: the refresh token is genuinely discarded at login and never retained, which I verified. That limits what a resident attacker can persist with, and it is a real mitigation worth keeping visible rather than losing along with the rest of the observation.

#### Evidence

- `frontend/app/auth/session.server.ts:20-28, 36-47` — `require_session_secret` reads `UNTANGLED_SESSION_SECRET` and the SSR process is the sole holder of the cookie signing secret.
- `frontend/app/auth/api.server.ts:65-80` — `api_fetch_with_token` attaches the Bearer token for every authenticated request, so every token in flight passes through this process.
- `frontend/app/routes/login.tsx:26-44` — the action reads the plaintext username and password from the form and passes them to `login_with_password`.
- `frontend/app/auth/api.server.ts:46-50` — the refresh token is explicitly discarded and never returned, which is the mitigation the accepted model credits and which I confirm holds.
- `frontend/Dockerfile:38-47` — the final image declares no `USER`, so this credential-handling process runs as root, which compounds the concentration and is the one aspect SR-012 does address.
- TM-REV-001 THR-028 — names the web tier as a candidate customization host and identifies this concentration as the reason it is the worst option.

#### Attack path or disconfirming path

1. An attacker achieves code execution in the SSR process, plausibly through the dependency path SR-012 describes.
2. The attacker reads the cookie signing secret and can forge a session for any user, observes every access token in flight, and captures the plaintext credentials of every user who signs in while resident.
3. Disconfirming path examined and rejected: the `.server.ts` convention separates server-only modules and the refresh token is discarded, both of which limit the attacker, but neither prevents secret or token access within the process. No process isolation, secret rotation, or bundle integrity monitoring exists.

#### Legitimate-user abuse case

Not applicable today. It becomes applicable if the web tier is chosen as the customization host, at which point a customization developer (ACT-007) writes code that runs inside the process holding every operator's credentials — which is the scenario THR-028 exists to prevent.

#### Prior decision or acceptance

- Decision reference: ADR 002
- Recorded rationale: TM-REV-001 THR-024 records this as "the accepted cost of ADR 002, recorded so the concentration is visible rather than to reopen the decision"
- Current applicability: Still supported as a deliberate trade — but the acceptance depends on the concentration staying visible, and folding it into a dependency finding is what makes it invisible

#### Requested resolution

Sol iteration 2 should give THR-024 its own record — an Informational or Medium finding, as Sol judges — that states the verified concentration facts, credits the refresh-token discard, notes that the process runs as root, and flags the concentration as a standing input to the THR-028 host decision. If Sol maintains that no separate record is warranted, it should at minimum change the coverage-table entry to say where the confirmed observation is preserved.

#### Final adversarial position

Pending Sol refinement.

### AR-010 — Prior accepted-risk table asserts a tolerance rationale where no tolerance decision exists

- Iteration disposition: New
- Critique type: Prior acceptance
- Related Sol findings: SR-001 to SR-013
- Related threats: All
- Related security requirements: None
- Candidate impact: Not applicable
- Candidate likelihood: Not applicable
- Candidate severity: Not applicable
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

Sol's section 11 opens correctly with "TM-REV-001 explicitly records that no individual risk was accepted. No finding was suppressed as accepted." Its table then contains a single row covering SR-001 through SR-013 with prior decision "No risk accepted", reassessment "Rationale undocumented for tolerance", and human review "Yes".

#### Opus challenge

The prose is right and the table contradicts it. "Rationale undocumented for tolerance" is a reassessment verdict about a tolerance decision that was examined and found to lack a rationale. TM-REV-001 records the opposite: no item was designated tolerate-rather-than-remediate, and the acceptance of the revision was acceptance of its description of the landscape, not of any risk within it. There is no tolerance decision whose rationale could be documented or undocumented.

The consequence is not cosmetic. The row marks thirteen findings as requiring human review specifically on prior-acceptance grounds, which is a category that does not apply to any of them. A consolidator reconciling human-decision counts will inherit thirteen spurious entries and will have to work out that the correct answer is zero.

The SR-014 row in the same table is well formed by contrast: issue #117 is a real recorded deferral, "Still supported" is a real reassessment of it, and human review is genuinely warranted because no removal condition is documented. That row is the model the rest of the table should follow — which is to say, the rest of the table should be empty.

#### Evidence

- Sol `security-review.md:1253` — the correct prose statement.
- Sol `security-review.md:1257` — the malformed row covering SR-001 to SR-013.
- Sol `security-review.md:1258` — the well-formed SR-014 row.
- TM-REV-001 section 15, human-accepted risks table — "No individual risk accepted at TM-REV-001 … no item here has been designated tolerate-rather-than-remediate. That decision belongs with security design, once requirements exist to remediate against".

#### Attack path or disconfirming path

Not applicable; this concerns the report's own accounting.

#### Legitimate-user abuse case

Not applicable.

#### Prior decision or acceptance

- Decision reference: TM-REV-001 section 15
- Recorded rationale: acceptance of the revision is acceptance of its description, not of any risk in it
- Current applicability: Still supported — the accepted position is explicit and Sol's prose states it correctly

#### Requested resolution

Sol iteration 2 should remove the SR-001 to SR-013 row or restate it as "Not applicable — no prior acceptance exists", set human review to "No" for that row, and retain the SR-014 row unchanged. The reassessment vocabulary should be reserved for items with a real prior decision.

#### Final adversarial position

Pending Sol refinement.

### AR-011 — Demo class definitions, demo permissions, and the RBAC probe route ship in the production surface

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-010
- Related threats: THR-016, THR-018, THR-027
- Related security requirements: None
- Candidate impact: Low
- Candidate likelihood: Low
- Candidate severity: Informational
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-010 covers the anonymous OpenAPI, Swagger and root surfaces and recommends disabling them outside development. No finding addresses what else the shipped artefact contains.

#### Opus challenge

Sol identified the documentation routes as development convenience left enabled in production, which is right, and then stopped short of the same question applied to everything else the build ships. Three demonstration artefacts reach a production deployment.

`demo-item.yaml` and `demo-link.yaml` sit in `backend/class-definitions/` alongside `user.yaml` and `incident.yaml`, and both Dockerfiles copy that whole directory and bake models from it. Because `migrate` reconciles the database to every definition in the directory, a production migration creates `demo_item` and `demo_link` tables. `demo-item` is also the first entry in `SEEDED_PERMISSION_CLASSES`, so the seed catalogue mints four `demo-item` permission keys and attaches them to the default `read-only` and `read-write` roles — meaning ordinary seeded principals carry permissions on a demonstration class. And `/auth/rbac-probe` is mounted unconditionally on the auth router, gated on `demo-item:read`, existing solely to prove RBAC works.

No exploit follows from any of this today, which is why I rate it Informational using Sol's own convention. Its significance is threefold: it enlarges the attack surface enumerated by the very OpenAPI document SR-010 objects to; it pollutes the permission namespace that ASM-021's tier model will have to partition; and it is the same class of defect as SR-010 — development affordances with no environment gate — so a finding that recommends an environment-aware configuration should account for all of them together rather than for the documentation routes alone.

#### Evidence

- `backend/class-definitions/demo-item.yaml` and `demo-link.yaml` — present in the production definitions directory with no marking distinguishing them.
- `backend/Dockerfile:11` — `COPY class-definitions ./class-definitions` copies the whole directory into the API image.
- `frontend/Dockerfile:11` — the same directory is copied into the models build stage for the web image.
- `backend/src/untangled/schema/migrate.py:72-81` — `load_definitions(definitions_dir)` reconciles the database to every definition present.
- `backend/src/untangled/seed/rbac_catalog.py:19-23` — `SEEDED_PERMISSION_CLASSES = ("demo-item", "incident", "change-request")`.
- `backend/src/untangled/seed/rbac_catalog.py:121-131` — the `read-only` and `read-write` roles receive `demo-item` permissions.
- `backend/src/untangled/auth/routes.py:39, 89-94` — `/auth/rbac-probe` is registered unconditionally and returns the required permission key.
- `backend/src/untangled/generated/demo_item.py`, `demo_link.py` — generated models for the demo classes are shipped in the installed package.

#### Attack path or disconfirming path

1. An attacker retrieves `/openapi.json` anonymously, per SR-010.
2. The schema includes `/auth/rbac-probe` and its documented permission requirement, confirming the permission-key format and that a `demo-item` class exists.
3. The attacker learns the deployment retains development scaffolding, which is a reliable signal that other development defaults — the JWT secret of SR-001, the seed passwords of SR-002 — may also be retained.
4. Disconfirming path examined and rejected: no environment guard exists on the definitions directory, the seed catalogue, or the probe route; `UNTANGLED_DEFINITIONS_DIR` lets an operator point elsewhere but the shipped default is the directory containing the demo classes.

#### Legitimate-user abuse case

None identified. The seeded `read-only` and `read-write` principals hold `demo-item` permissions they have no use for, which is a least-privilege deviation rather than an abuse path.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None; TM-REV-001 does not model the demo classes at all
- Current applicability: Not applicable

#### Requested resolution

Sol iteration 2 should either extend SR-010 to cover shipped development scaffolding generally — documentation routes, demo class definitions, demo permissions in default roles, and the probe route — or add a separate Informational finding. Either way it should state whether a production migration creates the demo tables, since that is the difference between a cosmetic surplus and a schema-level one, and should note the interaction with ASM-021's future namespace partition.

#### Final adversarial position

Pending Sol refinement.

### AR-012 — Access-token validation requires no `exp`, `iat`, issuer or audience claim

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-001, SR-004
- Related threats: THR-001, THR-006
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Low
- Candidate severity: Low
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-001 lists among its existing controls "algorithm allowlist; expiry; active-user and live-permission checks", and its evidence line says `auth/tokens.py:20-50` "requires only `sub`, `typ`, and valid timing claims". SR-004 addresses the unbounded configurable TTL and the absence of a `jti`.

#### Opus challenge

The algorithm allowlist is real and correctly credited — `jwt.decode(token, jwt_secret(), algorithms=[ACCESS_TOKEN_ALGORITHM])` closes the `alg: none` and algorithm-confusion family, which is the most important property here and Sol is right to note it.

The claim requirements are weaker than Sol describes. PyJWT's `decode` defaults to an empty `require` list, and its expiry check applies only when an `exp` claim is present. `decode_access_token` adds explicit checks for `typ` and `sub` but adds no `require` option, so a token carrying `sub` and `typ` and nothing else validates and never expires. Nothing validates an issuer or an audience either, since neither claim is minted.

Sol's phrase "valid timing claims" is therefore imprecise: timing claims are validated if present and ignored if absent. The practical consequence today is bounded, because minting such a token needs the signing secret, which is SR-001's precondition — a forger who holds the secret can already mint whatever they like. That is why I rate this Low rather than folding it into SR-001's Critical.

It matters for two forward-looking reasons that make it worth recording rather than dismissing. TM-REV-001 records an intended move from HS256 to ES256 under issue #67; in a multi-key world, claim requirements and issuer validation stop being redundant and become the mechanism that keeps a token issued for one purpose from validating for another. And SR-004's recommendation to bound configurable TTLs is incomplete without requiring `exp`, because a TTL ceiling constrains only tokens the product itself mints.

#### Evidence

- `backend/src/untangled/auth/tokens.py:41` — `jwt.decode(token, jwt_secret(), algorithms=[ACCESS_TOKEN_ALGORITHM])`, with no `options={"require": [...]}` and no `issuer` or `audience` argument.
- `backend/src/untangled/auth/tokens.py:42-50` — explicit checks exist for `typ` and `sub` only.
- `backend/src/untangled/auth/tokens.py:27-32` — the minted claim set is `sub`, `iat`, `exp`, `typ`; no `iss`, `aud`, or `jti`.
- `backend/requirements.lock` — `PyJWT==2.13.0`, whose `decode` defaults include `require: []` and apply `verify_exp` only to a present `exp` claim.
- RFC 8725 section 3.9 — recommends validating all claims the application relies on rather than assuming their presence.

#### Attack path or disconfirming path

1. An attacker who holds the signing secret, by the SR-001 default-fallback path or otherwise, mints `{"sub": "<admin uuid>", "typ": "access"}` with no `exp`.
2. The token validates and continues to validate indefinitely, surviving any later TTL reduction.
3. Disconfirming path: rotating the signing secret invalidates it, as it would any forged token, and `get_current_user` still re-reads the user row so deactivation remains effective. This is why the finding is Low and not an independent escalation.

#### Legitimate-user abuse case

None identified. No legitimate capability mints tokens.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list; issue #67
- Recorded rationale: the JWT-versus-opaque-session question is recorded as genuinely open, and the ES256 move is intent without a schedule
- Current applicability: Still supported — the open question does not depend on this, but the claim-validation gap should be closed regardless of how it resolves, and it becomes load-bearing if ES256 introduces multiple keys

#### Requested resolution

Sol iteration 2 should correct SR-001's characterisation of the validated claim set, and should fold a `require` list covering `exp`, `iat`, `sub` and `typ` — plus issuer validation once more than one key or issuer exists — into either SR-001's or SR-004's minimal recommendation. No separate finding is necessary if the recommendation is amended.

#### Final adversarial position

Pending Sol refinement.

## 8. Sol finding audit

| Sol finding | Evidence verified | Attack path | Rating | Provenance | Recommendation | Opus result | Related critiques |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SR-001 | Verified | Supported | Supported | Not applicable (full review) | Proportionate | Supported | AR-012 |
| SR-002 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — impact reasoning should be widened to host execution | AR-001, AR-003 |
| SR-003 | Verified | Supported | Supported | Not applicable | Under-engineered | Supported — mechanism and recommendation incomplete | AR-004 |
| SR-004 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | AR-012 |
| SR-005 | Verified | Supported | Challenged | Not applicable | Proportionate | Revise — severity and attack path | AR-007 |
| SR-006 | Partial | Supported | Supported | Not applicable | Proportionate | Revise — disconfirming half unsupported; API tier omitted | AR-006 |
| SR-007 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — scope should extend across references | AR-002, AR-005 |
| SR-008 | Verified | Supported | Challenged | Not applicable | Under-engineered | Supported — likelihood understated, bounds mischaracterised | AR-005 |
| SR-009 | Verified | Supported | Supported | Not applicable | Under-engineered | Supported — recommendation blocked by an unexamined product dependency | AR-001, AR-003 |
| SR-010 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | AR-011 |
| SR-011 | Verified | Supported | Supported | Not applicable | Proportionate | Supported for the migration helpers; THR-027 link unsupported | AR-008 |
| SR-012 | Verified | Supported | Supported | Not applicable | Proportionate | Supported for supply chain and container privilege; THR-019 link unsupported | AR-008, AR-009 |
| SR-013 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | None |
| SR-014 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — parity claim needs the enrichment exception | AR-002 |

### Meaningful no-finding claims

| Sol claim or threat | Evidence independently checked | Opus result | Related critiques or residual uncertainty |
| --- | --- | --- | --- |
| Present stored XSS not substantiated (THR-010) | Searched the frontend for `dangerouslySetInnerHTML`, `innerHTML`, `srcDoc`, `eval` and `new Function`: none present. Checked every `href={…}` sink: `basic_list.tsx:529,544` and `detail/fk_open_related.ts:46` route through `record_detail_path`, which applies `encodeURIComponent` to the locator and prefixes an allowlisted collection, so no `javascript:` URL is constructible; `list_context_bar.tsx:171` is a static template | Supported | Withdrawal is correct. Residual: the conclusion depends on React's default escaping and holds only until a rich-text or Markdown surface is introduced, exactly as THR-010 states |
| SQL injection in predicate search withdrawn | Read the whole compiler. Attribute names resolve through `_require_attribute` against `searchable_attributes`, which is built from the class definition and the injected system fields; every identifier is composed via `sql.Identifier`; every value is a `sql.Placeholder`; `_escape_like_literal` neutralises LIKE metacharacters; the sole `sql.Literal` use is the fixed escape character | Supported | Withdrawal is correct and well reasoned. Residual: none for injection. The same code is nevertheless the subject of AR-005 on resource grounds |
| SSRF through `api_fetch_with_token` not presently reachable | Traced the only production caller. `destination_list.tsx:108` calls `find_list_option`, which resolves the collection through the two-entry `COLLECTION_CLASS` allowlist and returns null otherwise, producing a 404 before any request is built; `search.server.ts:76` then interpolates the validated value | Supported | Withdrawal is correct, and Sol's defence-in-depth suggestion to remove absolute-URL support is sound. Residual: the validation lives in the caller, not in `api_fetch_with_token`, so a future caller could omit it |
| Current legacy/v1 authorization bypass not substantiated (THR-026) | Confirmed both surfaces are produced by `build_class_router` and both apply `require_class_operation` identically at `router_factory.py:88-90` and `162-165` | Supported for authorization | Incomplete for disclosure: the surfaces already differ in projection content because FK enrichment exists only on v1 — see AR-002 |
| Missing authenticated cache control everywhere — narrowed | Confirmed the single `data()` header at `authenticated.tsx:36-39` and confirmed that no route in the repository exports a `headers` function; the supporting test asserts a loader object, not an HTTP response | Disputed | AR-006. The narrowing is not supported by the evidence offered, and Sol's own section 14 concedes it |
| Current customization or recovery exploit — coverage gaps not findings | Confirmed no customization runtime, host process, service identity, recovery endpoint or notification channel exists anywhere in the repository | Supported | Correct. The related accounting problem is that two of these threats are nonetheless linked to findings — see AR-008 |
| THR-024 — no independent issue substantiated | Confirmed the SSR process holds the cookie secret, sees every token, and handles plaintext credentials; confirmed the refresh token is genuinely discarded at `api.server.ts:46-50` | Incomplete | AR-009. The conclusion is defensible; the placement inside SR-012 loses the confirmed observation |
| THR-018, THR-025, THR-028 — insufficient evidence | Confirmed no configuration promotion engine, no recovery flow, and no customization host exist | Supported | Correctly recorded as coverage gaps with no finding attached |

## 9. Iteration critique ledger

| Critique ID | Iteration 1 concern | Sol iteration 2 response | Final disposition | Final justification |
| --- | --- | --- | --- | --- |
| AR-001 | Shared database role is superuser-equivalent by product requirement; database access escalates to host command execution | Not applicable | New | Awaiting Sol iteration 2 |
| AR-002 | FK enrichment discloses referenced-class content with no referenced-class permission check | Not applicable | New | Awaiting Sol iteration 2 |
| AR-003 | Operator CLIs print the database password and effective seed passwords | Not applicable | New | Awaiting Sol iteration 2 |
| AR-004 | Unbounded login body and password length against a shared bounded worker pool | Not applicable | New | Awaiting Sol iteration 2 |
| AR-005 | Search guardrails amplify rather than bound; COUNT doubles the work; offset is unbounded | Not applicable | New | Awaiting Sol iteration 2 |
| AR-006 | SR-006 narrows an accepted threat-model claim on unverified evidence and omits the API tier | Not applicable | New | Awaiting Sol iteration 2 |
| AR-007 | SR-005 merges two weaknesses of different likelihood and rates both at the lower | Not applicable | New | Awaiting Sol iteration 2 |
| AR-008 | Finding and coverage tables disagree about which forward-looking threats were analysed | Not applicable | New | Awaiting Sol iteration 2 |
| AR-009 | THR-024 concentration has no finding of its own | Not applicable | New | Awaiting Sol iteration 2 |
| AR-010 | Prior accepted-risk table asserts a tolerance rationale that does not exist | Not applicable | New | Awaiting Sol iteration 2 |
| AR-011 | Demo classes, demo permissions and the RBAC probe ship in production | Not applicable | New | Awaiting Sol iteration 2 |
| AR-012 | Token validation requires no `exp`, `iat`, issuer or audience | Not applicable | New | Awaiting Sol iteration 2 |

## 10. Missed-finding candidates

| Critique ID | Candidate weakness | Evidence | Candidate severity | Related threats | Next treatment |
| --- | --- | --- | --- | --- | --- |
| AR-001 | Runtime, migration and seed share a database role the product requires to be superuser-equivalent, so SQL access reaches host command execution | `schema/versions.py:58-66`; `schema/migrate.py:100-103`; `persistence/connection.py:10-20`; `compose.yaml:6-11`; `docs/class-definitions.md:279-287` | High | THR-002, THR-014, THR-020, THR-021 | Sol iteration 2 |
| AR-002 | FK identity enrichment returns referenced-class display content with no permission check on the referenced class | `persistence/fk_enrichment.py:69-72, 126-158`; `router_factory.py:85-91, 160-166`; `user.yaml`; `seed/rbac_catalog.py:19-23` | Medium | THR-011, THR-012, THR-026 | Sol iteration 2 |
| AR-003 | Both operator CLIs print the full `DATABASE_URL`, and the seed CLI prints the effective, possibly production, seed passwords | `seed/cli.py:26, 34-39`; `schema/cli.py:51`; `seed/users.py:75-77` | Medium | THR-002, THR-014, THR-017 | Sol iteration 2 |
| AR-004 | Unauthenticated login accepts an unbounded body and password and shares one bounded worker pool with every record route | `auth/routes.py:42-52`; `auth/passwords.py:8`; `router_factory.py:47, 85, 160, 180, 200`; `backend/Dockerfile:27` | High | THR-003, THR-004 | Sol iteration 2 |
| AR-005 | Predicate bounds permit roughly 2,500 pattern leaves per request; the mandatory `COUNT(*)` evaluates them again across the full class; `offset` and sort-key count are unbounded | `persistence/search.py:27-28, 172-179, 232-239, 354-357, 426-436, 274-281, 302-326`; `search_models.py:57`; `destination_list.tsx:199-222` | High | THR-012, THR-013 | Sol iteration 2 |
| AR-009 | Web-tier credential concentration is verified but recorded only as supporting evidence inside a dependency finding | `session.server.ts:20-47`; `api.server.ts:65-80`; `login.tsx:26-44`; `frontend/Dockerfile:38-47` | Medium | THR-024, THR-021, THR-028 | Sol iteration 2 |
| AR-011 | Demo class definitions, demo permissions attached to default roles, and `/auth/rbac-probe` ship in the production artefact | `backend/class-definitions/demo-*.yaml`; `backend/Dockerfile:11`; `seed/rbac_catalog.py:19-23, 121-131`; `auth/routes.py:89-94` | Informational | THR-016, THR-018, THR-027 | Sol iteration 2 |
| AR-012 | `decode_access_token` requires no `exp`, `iat`, issuer or audience, so a token minted without `exp` never expires | `auth/tokens.py:27-32, 41-50`; `PyJWT==2.13.0` default `require: []` | Low | THR-001, THR-006 | Sol iteration 2 |

## 11. Prior accepted-risk reassessment

| Finding or critique | Prior decision or rationale | Current evidence and security practice | Opus reassessment | Human review needed |
| --- | --- | --- | --- | --- |
| All findings SR-001 to SR-013 / AR-010 | TM-REV-001 section 15 records that no individual risk was accepted; acceptance of the revision was acceptance of its description of the landscape | Confirmed by reading the accepted threat model at the pinned commit. No tolerate-rather-than-remediate designation exists for any threat | Not applicable — there is no prior acceptance to reassess. Sol's table row asserting an undocumented tolerance rationale should be removed | No |
| SR-014 / legacy record surface | Removal tracked as issue #117 under the AGENTS.md section 3.9 API-compatibility-cleanup convention; TM-REV-001 THR-026 rates it Low because the shared factory prevents present divergence | The shared factory is verified: both surfaces apply the same `require_class_operation` dependency. But the surfaces are no longer behaviourally identical — FK identity enrichment exists only on v1, so they already differ in what they disclose (AR-002) | Conditions changed — the rationale for Low rests on parity, and parity now holds for authorization but not for projection content. The deferral remains reasonable; the justification needs restating, and the missing removal condition remains the substantive gap | Yes |
| ADR 002 / THR-024 web-tier concentration | TM-REV-001 records this as the accepted cost of ADR 002, "recorded so the concentration is visible rather than to reopen the decision" | Verified in code: the SSR process holds the cookie secret, sees every token, and handles plaintext credentials; the refresh-token discard genuinely limits persistence; the process runs as root | Still supported as a deliberate trade — but the acceptance is explicitly conditional on the concentration staying visible, and Sol's placement of it inside a dependency finding works against that condition (AR-009). It also becomes an input rather than a settled cost once a customization host is chosen | Yes |
| ASM-024 / identifiers provisionally non-sensitive | Human-confirmed but explicitly provisional, with FK view inheritance named as a candidate refinement | The implemented v1 surface returns referenced-record display content, not merely identifiers, so the exposure already exceeds what the assumption contemplates | Conditions changed — the provisional assumption reasons about identifier values; the code discloses referenced content. The candidate refinement should be treated as a present gap rather than a future option (AR-002) | Yes |
| ASM-007 / fail-closed secret handling | Human-confirmed intent; TM-REV-001 already notes the API does not implement it | Verified: the web tier fails closed on both its secrets, the API defaults both of its own | Rationale unsupported for the API tier — the assumption states a posture the implementation contradicts, which TM-REV-001 acknowledges and SR-001 and SR-002 correctly find against | No |

## 12. Threat and coverage gaps

| Threat ID or surface | Sol treatment | Opus assessment | Related critiques | Remaining evidence needed |
| --- | --- | --- | --- | --- |
| THR-001 | Finding SR-001 | Adequate | AR-012 | None |
| THR-002 | Finding SR-002 | Incomplete — impact stops at data compromise; the role is superuser-equivalent | AR-001, AR-003 | Privilege level of the shipped and documented database role |
| THR-003 | Finding SR-003 | Adequate | AR-004 | None |
| THR-004 | Finding SR-003 | Incomplete — no request-body or password bound; shared worker pool not identified | AR-004 | Threadpool sizing and measured Argon2 cost under concurrency |
| THR-005 | Finding SR-003 | Adequate — the early return in `authenticate_user` is correctly identified | AR-004 | Network-level timing measurement, as Sol states |
| THR-006 | Finding SR-004 | Adequate | AR-012 | None |
| THR-007 | Finding SR-004 | Adequate — rotation atomicity independently verified as correct | None | None |
| THR-008 | Finding SR-005 | Adequate for CSRF; rating disputed for the redirect half | AR-007 | None |
| THR-009 | Finding SR-006 | Incomplete — narrowing unsupported; API tier omitted | AR-006 | Captured document response headers from a built server |
| THR-010 | No issue substantiated | Adequate — independently re-tested across all HTML and URL sinks | None | Re-review when rich text or custom rendering is introduced |
| THR-011 | Finding SR-007 | Incomplete — cross-reference disclosure not covered | AR-002 | Inventory of classes reachable through FK enrichment |
| THR-012 | Finding SR-007 | Adequate for extraction; amplification understated | AR-005 | None |
| THR-013 | Finding SR-008 | Incomplete — per-request multiplier, COUNT duplication and unbounded offset absent | AR-005 | Load measurement, as Sol states |
| THR-014 | Finding SR-009 | Incomplete — privilege level and credential logging absent | AR-001, AR-003 | Same as THR-002 |
| THR-015 | Finding SR-009 | Adequate but submerged — the collision is verified and is invoked during migration | None | None |
| THR-016 | Finding SR-010 | Incomplete — shipped demo scaffolding not covered; verbose validation errors not covered | AR-011 | None |
| THR-017 | Findings SR-007, SR-009 | Adequate | AR-003 | None |
| THR-018 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded | AR-008 | Promotion engine design (U6, U7) |
| THR-019 | Insufficient evidence, but linked to SR-012 | Missing — SR-012 analyses nothing about the sandbox | AR-008 | Sandbox isolation design (U1) |
| THR-020 | Finding SR-011 | Adequate | AR-001 | None |
| THR-021 | Finding SR-012 | Adequate | AR-001 | Advisory and provenance scan, as Sol states |
| THR-022 | Finding SR-013 | Adequate — independently confirmed no `SECURITY.md` and no `.github` directory | None | None |
| THR-023 | Finding SR-006 | Adequate | AR-006 | Production transport topology, out of scope |
| THR-024 | No independent issue substantiated, linked to SR-012 | Incomplete — verified observation has no record of its own | AR-009 | None |
| THR-025 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded | None | Recovery flow design |
| THR-026 | Informational SR-014 | Incomplete — parity claim needs the enrichment exception | AR-002 | None |
| THR-027 | Insufficient evidence, but linked to SR-011 | Missing — SR-011 analyses nothing about tier identity | AR-008 | Tier mechanism design (issue #116) |
| THR-028 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded, but the web-tier evidence bearing on the host choice should be preserved | AR-009 | Host decision (U1) |
| Surface: `/auth/rbac-probe` and demo classes | Not examined | Missing | AR-011 | None |
| Surface: verbose validation error responses | Not examined | Incomplete — `request_validation.py:60-63` returns the full Pydantic error list including echoed input, which TM-REV-001 THR-016 names explicitly | AR-011 | None |

## 13. Diff-aware assessment

Not applicable — full-review mode. No base ref, target ref, diff hash or supplied diff was provided, and the manifest records the run as a full review of a pinned snapshot. Sol's decision not to assign change provenance is correct.

### Provenance corrections

| Finding or critique | Sol classification | Opus classification | Evidence |
| --- | --- | --- | --- |
| Not applicable | Not applicable | Not applicable | Full-review mode; no provenance was assigned or required |

### Introduced risks or regressions Sol missed

- None identified — not applicable in full-review mode.

### Pre-existing weaknesses that remain relevant

- Not applicable as a provenance category. Every weakness discussed in this review exists at the pinned commit, and the two items that most risk being submerged inside larger findings are recorded in section 3 under pre-existing weaknesses requiring renewed attention.

## 14. Disagreements

| Related item | Sol position | Opus position | Evidence for each | Final status |
| --- | --- | --- | --- | --- |
| SR-006 cache-control narrowing | The authenticated layout sets `private, no-store`, so the threat model's cache-control claim does not stand as written | The claim is unsupported: no route exports `headers`, and the only evidence is a loader-level unit assertion that Sol itself says does not establish runtime behaviour | Sol: `authenticated.tsx:36-39`, `route_wiring.test.ts:91`. Opus: same files, plus the absence of any `headers` export and Sol's own section 14 concession | Open — resolvable by evidence |
| SR-005 severity | Low, on the basis that the attack requires user interaction and account confusion | The redirect half needs neither; one crafted link to the legitimate domain and an existing session suffice, giving Medium likelihood and a Medium matrix result | Sol: merged rating and the form-post attack path. Opus: `login.tsx:16-24` loader redirect, `next_path.ts:12`, WHATWG backslash normalisation | Open |
| SR-008 likelihood | Medium, because cost varies by data and pattern | High, because the guardrails permit roughly 2,500 pattern leaves per request evaluated twice against the full class, so a single request is plausibly sufficient | Sol: bounds described as ineffective. Opus: `search.py:27-28, 172-179, 354-357, 426-436` | Open |
| SR-002 and SR-009 blast radius | Database compromise yields complete data compromise bypassing application controls | It yields host command execution, because the role the product requires and ships is superuser-equivalent | Sol: `connection.py`, `compose.yaml`. Opus: same, plus `schema/versions.py:58-66`, `migrate.py:100-103`, `docs/class-definitions.md:279-287` | Open |
| SR-009 recommendation feasibility | Separate runtime, migration, seed and human database roles | Sound in direction but not achievable for the migration role without a product change, because `migrate` unconditionally requires restore-point privilege | Sol: recommendation text. Opus: `migrate.py:100-103`, `versions.py:58-66` | Open |
| SR-007 scope | Class-wide exposure of the requested class's rows and attributes | Also cross-class: enrichment returns referenced-class content with no referenced-class permission check | Sol: `rbac/dependencies.py`, `search.py`. Opus: `fk_enrichment.py:69-72, 126-158`, `user.yaml` | Open |
| SR-011 and SR-012 threat linkage | SR-011 addresses THR-027; SR-012 addresses THR-019 | Neither does; Sol's own coverage table says so | Sol: finding table rows 139-140 versus coverage rows 1210, 1218 | Open — internally resolvable |
| Section 11 prior-acceptance row | Thirteen findings need human review on prior-acceptance grounds with an undocumented tolerance rationale | No tolerance decision exists; the row contradicts Sol's own prose and the accepted threat model | Sol: `security-review.md:1253` versus `:1257`. Opus: TM-REV-001 section 15 | Open — internally resolvable |

## 15. Validated strengths

| Sol item | What was verified | Evidence | Residual uncertainty |
| --- | --- | --- | --- |
| SR-005's `safe_next_path` backslash bypass | Independently reproduced by reading the guard against WHATWG parsing rules. This is a real defect absent from TM-REV-001 and it is the review's most valuable original contribution | `next_path.ts:12`; `auth.test.ts:8-21` shows the untested case | Only the severity is disputed (AR-007); the finding itself is sound |
| SR-014 / SQL injection withdrawal | The predicate compiler is genuinely safe: attribute names validated against the class definition, identifiers composed with `sql.Identifier`, values as placeholders, LIKE metacharacters escaped, the sole literal being a fixed escape character | `persistence/search.py:462-593, 596-608`; `fk_enrichment.py:143-158` | None for injection |
| SSRF withdrawal | The only production caller validates the collection through a two-entry allowlist before any request is constructed, and returns 404 otherwise | `destination_list.tsx:108`; `nav_paths.ts:12-15, 111-137`; `search.server.ts:74-82` | Validation lives in the caller rather than in the fetch helper |
| Stored-XSS withdrawal | Re-tested independently across every HTML and URL sink in the frontend. No dangerous sink exists, and every `href` is either static or built through `record_detail_path`, which percent-encodes the locator behind an allowlisted collection | Repository-wide sink search; `basic_list.tsx:529,544`; `fk_open_related.ts:46`; `record_paths.ts:4-10` | Holds only until rich text arrives, as THR-010 states |
| SR-004's crediting of per-request account and permission resolution | Verified that `get_current_user` re-reads the user row and rejects inactive accounts on every request, and that `get_effective_permissions` resolves permissions from the database per request. This genuinely bounds SR-004 to session continuation rather than stale authority | `auth/dependencies.py:43-51`; `rbac/dependencies.py:21-29` | None |
| SR-004's crediting of refresh rotation | `_claim_valid_refresh` performs a single atomic `UPDATE … WHERE revoked_at IS NULL AND expires_at > now RETURNING`, so two concurrent claimants cannot both succeed. Sol's judgement that rotation is well built is correct | `auth/store.py:74-87, 138-160` | Reuse detection remains absent, as Sol says |
| SR-001's crediting of the algorithm allowlist | `jwt.decode` is called with an explicit `algorithms` list, closing the `alg: none` and algorithm-confusion family | `auth/tokens.py:41` | Claim requirements are weaker than described (AR-012) |
| Not claimed by Sol — writable models exclude system fields | The generated `Create` and `Update` models omit `id`, `created_at`, `updated_at`, `created_by` and `updated_by` and set `extra='forbid'`, so a client cannot forge attribution through the API. This meaningfully bounds THR-015 to non-HTTP paths and deserves recording | `generated/incident.py:58-102`; `mapping/system_fields.py:8-16`; `router_factory.py:54-55, 192` | None |
| Not claimed by Sol — web-tier fail-closed configuration | `assert_web_auth_config` and `require_session_secret` genuinely refuse to run without their secrets, and `cookie_secure_from_env` defaults `Secure` on and throws on an unrecognised value rather than guessing | `config.server.ts:6-45`; `session.server.ts:20-28` | The contrast with the API tier is the substance of SR-001 and SR-002 |

## 16. Unknowns and required evidence

| Related item | Unknown or gap | Why it matters | Evidence or decision needed |
| --- | --- | --- | --- |
| AR-001 | The privilege level a real production deployment's database role actually holds, and whether any customer has been told to split migration privilege from runtime privilege | Decides whether SR-002's consequence is data compromise or host command execution, and whether SR-009's recommendation is implementable | Deployment guidance for database roles; a decision on whether the restore point should be optional or separately privileged |
| AR-006 | Whether `Cache-Control: private, no-store` reaches the SSR document response | Decides whether an accepted threat-model claim may be narrowed | A captured document response from a built web tier, or a route `headers` export |
| AR-004, AR-005 | Actual saturation thresholds for the Argon2 path and for amplified predicates | Sets operational likelihood and the numeric values of any cap | Local load fixtures with representative data volume, as both Sol and this review record |
| AR-002 | Which classes will become reachable through FK enrichment as CMDB and integration credentials land | Decides whether this stays Medium or becomes a primary confidentiality control | The referenced-class inventory at the point attribute-level authorization is designed |
| THR-011, ASM-019 | Whether record-level authorization will exist, and on what model | Sol correctly records this as unresolved; it is the largest present exposure and neither review can close it | Human architect decision, then security design |
| THR-019, THR-027, THR-028, ASM-010, ASM-021, ASM-023 | Sandbox isolation model, customization host and call identity, tier identity mechanism and normalisation rule, additive-only semantics | Four unbuilt controls carry impact reductions elsewhere in the accepted model; no code analysis can advance them | Design closure on U1, U6, U7 and issue #116 |
| SR-012 | Whether any currently pinned dependency carries a known advisory | Neither review scanned; Sol is explicit that it makes no such claim | An authorized SCA and SBOM run |
| AR-011 | Whether a production migration actually creates the `demo_item` and `demo_link` tables | Distinguishes a cosmetic surplus from a schema-level one | A migration plan run against a clean database with the shipped definitions directory |

## 17. Final handoff

### Iteration 1 requests for Sol refinement

- **AR-001** — Establish the privilege level of the shipped and documented database role and restate SR-002's impact and SR-009's feasibility accordingly.
- **AR-002** — Record the cross-reference disclosure as a finding or justify keeping it inside SR-007, and inventory the classes reachable through enrichment.
- **AR-003** — Correct SR-002's evidence line and record the `DATABASE_URL` and effective-password disclosure in both CLIs.
- **AR-004** — Complete SR-003's mechanism with the unbounded body, unbounded password, and shared worker pool, and note that a dummy hash without a length cap increases attacker-available work.
- **AR-005** — Quantify the per-request predicate multiplier, record the COUNT duplication and the unbounded offset and sort-key count, and revisit SR-008's likelihood.
- **AR-006** — Produce document-level header evidence or withdraw the narrowing from both the executive summary and SR-006, and extend SR-006 to the API tier.
- **AR-007** — Split SR-005 or rate the merged record at the higher matrix result, and add the authenticated loader redirect path.
- **AR-008** — Reconcile the finding table with the coverage table for THR-019 and THR-027.
- **AR-009** — Give THR-024's verified concentration a record of its own, or state where it is preserved.
- **AR-010** — Remove or restate the malformed prior-acceptance row so consolidation does not inherit thirteen spurious human-review items.
- **AR-011** — Extend SR-010 to shipped development scaffolding, or add a separate Informational finding, and state whether demo tables are created by a production migration.
- **AR-012** — Correct SR-001's description of the validated claim set and fold a claim-requirement list into SR-001's or SR-004's recommendation.

### Iteration 2 items for consolidation

Pending final adversarial pass.

### Items requiring human judgment

- Whether the product should guarantee that the application runtime can operate under a non-superuser database role, which requires a decision about the restore point in the migration path (AR-001).
- Whether foreign-key attributes should inherit view permission from the referenced class, which ASM-024 already names as a candidate refinement and which AR-002 shows is a present gap rather than a future one.
- Whether the accepted THR-009 claim may be narrowed on the evidence Sol has offered, which is a question about evidentiary standards for amending accepted intent as much as about caching (AR-006).
- Whether the web tier's confirmed credential concentration should be recorded as a standing constraint on the THR-028 host decision, given that TM-REV-001's acceptance of ADR 002 is explicitly conditional on the concentration remaining visible (AR-009).
- Whether the legacy record surface's Low rating survives the observation that the two surfaces already differ in disclosure, and what removal condition should be attached to issue #117 (AR-002, SR-014).

## 18. Completion

Critique counts:

- New: 12
- Addressed: 0
- Partially addressed: 0
- Unresolved: 0
- Withdrawn: 0
- Missed-finding candidates: 8
- Severity challenges: 3 (AR-001 on SR-002 and SR-009 impact, AR-005 on SR-008 likelihood, AR-007 on SR-005 severity)
- Provenance challenges: 0 (full-review mode; no provenance was assigned)
- Prior-acceptance reconsiderations: 5 (recorded in section 11; one of them, AR-010, is a formal defect in Sol's own prior-acceptance accounting)

Completion checks:

- [x] Inputs match the run manifest and pinned hashes.
- [x] Every Sol finding is accounted for.
- [x] Every meaningful Sol no-finding claim is independently accounted for.
- [x] Every critique has evidence and requested treatment.
- [x] Missed threats and legitimate-user abuse were independently considered.
- [x] Every identified pre-existing weakness remains visible.
- [x] Every identified previously accepted weakness has a current reassessment.
- [x] Diff provenance is challenged when applicable — not applicable in full-review mode, and Sol's handling of that is verified correct.
- [ ] Iteration 2 accounts for every iteration 1 critique — not applicable at iteration 1.
- [ ] Iteration 2 maps every unresolved critique, missed-finding candidate, and human question into the final handoff — not applicable at iteration 1.
- [ ] Iteration 2 requests no further automated Sol or Opus pass — not applicable at iteration 1.
- [x] Unresolved disagreements and uncertainty are preserved.
- [x] Summary tables match authoritative detailed records.

All checks applicable to iteration 1 pass. The three unchecked items are iteration 2 obligations and are marked not applicable rather than incomplete.
