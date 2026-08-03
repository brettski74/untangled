# Adversarial Review — Opus Critique

Status: Complete
Run ID: 20260803T113549Z-f074efdc579f-full-review-de0326
Iteration: 2
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
| Current Sol security review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-2/security-review.md` |
| Current Sol security-review SHA-256 | `71539c1ac1ded48c4b2c2557dc06faecbe1cd8834cf3c1d74e520f0923a63e15` (verified) |
| Iteration 1 security review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-1/security-review.md` |
| Iteration 1 security-review SHA-256 | `8374cb9303db2b9e9a5b0767ccdde9a2a5abb38859db45aac3943bf45cd608f5` (verified) |
| Iteration 1 adversarial review | `/home/blg/dev/untangled/security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/iteration-1/adversarial-review.md` |
| Iteration 1 adversarial-review SHA-256 | `10b95d7369c7d475cfe8760adf4a17e84fe3fd95423f869c712c593fc0c9fcd7` (verified) |

Validation performed before analysis: repository `HEAD` equals the pinned target commit; the threat model read from the pinned Git object and from the working tree both hash to the manifest value and the document is `Status: Accepted` at `TM-REV-001`; all three prior artefacts hash to their supplied values; the manifest phase ledger records this invocation as Opus iteration 2, attempt 1, with the same pinned inputs; the output path is inside the supplied run directory and did not previously exist, so no completed-output collision was overwritten.

## 2. Scope

### In scope

- Full accepted TM-REV-001 scope: the single-tenant, customer self-hosted, internet-facing platform comprising the FastAPI backend, the React Router v7 SSR web tier, and PostgreSQL, at the pinned commit.
- Implemented Milestone 1 surfaces: `/auth/*` including `/auth/refresh`, `/auth/logout`, `/auth/me` and `/auth/rbac-probe`; class-wide RBAC; the legacy and `/api/v1` Incident and Change Request routers including the create, update and delete routes; the predicate search compiler; FK identity enrichment; the class-definition loader and code generators; the schema-migration and seed CLIs; and the SSR session, gate, list and record seams.
- Deployment inputs: `compose.yaml`, both Dockerfiles, Python and npm dependency manifests and lockfiles, and every shipped class definition.
- Forward-looking accepted intent (configuration promotion, class tiers, customization runtime and host, SSO, account recovery, non-browser clients, event bus, CMDB) to the extent TM-REV-001 models it.
- The complete Sol iteration 2 report: all nineteen findings, its iteration ledger, its Opus-critique dispositions, its threat-coverage table, its prior-acceptance table, its attack chains, its withdrawn candidates, and its completion counts.
- The iteration 1 Sol and Opus artefacts, for continuity of the AR ledger.

### Explicit exclusions

- Threat-model out-of-scope items only: physical and data-centre security; customer-owned host, network, load-balancer, Kubernetes and backup infrastructure; the vendor's own CI/CD; the customer's configuration CI/CD arrangements (ASM-026); customer forks of the core product (ASM-022); multi-tenant shared-database isolation (ASM-001).
- No additional exclusions were applied by this review.

### Scope limitations

- Static and read-only analysis. No process was started, no database was connected to, no HTTP request was issued, and no runnable exploit was executed. Every exploitability statement is derived from code reading and from documented PostgreSQL, PyJWT, Starlette, argon2-cffi and WHATWG URL behaviour, not from observed runtime behaviour.
- The resource-consumption multipliers in AR-005 were re-derived from the code's own constants and control flow. Absolute saturation thresholds remain unmeasured, exactly as both reviews record.
- The SSR document-response header question (AR-006) remains unresolved by evidence. No built server response was captured by either party, and Sol now records that correctly rather than claiming otherwise.
- Dependency contents were not scanned against any advisory database, matching Sol's own limitation.
- AR-016 concerns a `create-default` value that is shipped to the web tier as generated field metadata. This review confirmed that no create form consumes it yet, which bounds the critique's likelihood; it did not exercise any future create surface.

## 3. Executive adversarial assessment

### Overall assessment of Sol's review

Sol's iteration 2 is a substantially better report than iteration 1 and it earns that assessment on verified substance rather than on responsiveness. Every one of the twelve iteration 1 critiques is genuinely addressed, not merely acknowledged, and I re-checked the underlying code rather than accepting Sol's summary of it. The five new records are all real and correctly evidenced: I confirmed that `create_restore_point` is called unconditionally before any DDL on every non-empty plan and that its own docstring records the superuser requirement (SR-015); that `resolve_fk_fields` unconditionally appends `created_by` and `updated_by` as `user` references and the plan builder joins and projects the target's display column with no referenced-class check (SR-016); that both operator CLIs print the raw connection string and that the seed CLI prints `password_for(seed)`, which returns the environment override (SR-017); that the SSR process holds the cookie secret, attaches every Bearer token, handles plaintext credentials and runs without a `USER` directive (SR-018); and that the shipped definitions directory contains both demo classes, that `load_definitions` reconciles every definition present, that the seed catalogue attaches `demo-item` permissions to the default read roles, and that `/auth/rbac-probe` is mounted unconditionally (SR-019).

Three of Sol's judgement calls deserve explicit credit because I tried to overturn them and could not. Sol's Low impact on SR-016 is right, and better supported than my iteration 1 reasoning was: I inventoried every foreign key in the shipped definitions and the only reachable enrichment target is `user`, whose display attribute is `display-name`, whose `username` and `password-hash` are not selected, and which carries no friendly-id, so the disclosed content really is display names and nothing more. Sol's re-derivation of the ~2,500-leaf predicate ceiling is arithmetically correct: with the root compiled at depth 1 and the depth guard rejecting only depth greater than 3, a fifty-child `and` of fifty-child `or` nodes is the maximum legal shape. And Sol's careful phrasing that SR-015 reaches "database-container command/file authority" rather than generic host compromise is more accurate than my iteration 1 wording.

The review's remaining weaknesses are narrower than iteration 1's and fall into two groups.

First, an accounting defect that will propagate into consolidation. SR-014 and SR-019 are labelled `Informational` while simultaneously recording impact and likelihood values that produce `Low` under the accepted matrix. The consolidation template resolves this explicitly — it permits `Not applicable` for impact and likelihood "for Informational only" — so the combination Sol wrote is one the next phase cannot transcribe without changing something. Sol's own completion counts then report `Low: 0`, which is true of its labels and false of its matrix inputs. The same section under-reports uncertainty: SR-015 appears in Sol's own unknowns table with a consequence that decides whether customers can avoid a superuser-equivalent runtime, yet is excluded from the `Uncertain: 5` count. I raised this class of defect in iteration 1 as AR-008 and AR-010 and Sol fixed both instances I named; this is a third instance I did not name, and I have to record that my own iteration 1 AR-011 committed exactly the same error, assigning Low impact and Low likelihood to an `Informational` candidate while asserting no departure from the matrix.

Second, two implemented paths that neither report reaches. Record deletion is a hard `DELETE FROM … WHERE id = …` on the legacy surface; when the row goes, so do its `created_by`, `updated_by` and timestamps, so an authorized delete leaves no evidence anywhere in the product that anything ever existed. SR-009 claims the accountability territory but evidences it entirely through direct database authority, and SR-007 covers unrecorded reads; nothing covers unrecorded authorized destruction through the ordinary HTTP route. Separately, `change-request.yaml` ships a `create-default` for `requested-by` whose value is the seeded administrator UUID, which is also `STUB_ACTOR_ID` — the product's own default answer to "who requested this change" is the account whose attribution THR-015 already says cannot be trusted.

One structural fact also corrects SR-014's characterisation rather than its rating: the two record surfaces are not parallel. `create`, `update` and `delete` are built only when `surface == "legacy"`, so the deprecated surface is the sole write surface. That matters both for the drift argument SR-014 makes and for SR-014's stated recovery of removing legacy under issue #117, which cannot happen until writes are versioned.

Confidence should rise on SR-015, SR-016, SR-017, SR-018 and SR-019, all of which I re-verified line by line, and on SR-001 through SR-013, whose iteration 1 substance survived a second pass. No finding should have its severity lowered. No Sol/Opus security disagreement remains open.

### Most consequential challenges

- **AR-015** — Authorized record deletion is irreversible and completely unattributable: the row and its audit columns are removed together, and no finding evidences the API destruction path. SR-009 owns the accountability claim but reasons only about direct database access, whose likelihood justification does not apply to an ordinary HTTP route.
- **AR-013** — Two findings carry an `Informational` label alongside impact and likelihood values that produce `Low` under the accepted matrix, and the derived counts report zero Low findings and understate material uncertainty. Consolidation will inherit both errors.
- **AR-014** — SR-014 describes the legacy and v1 surfaces as parallel; create, update and delete exist only on legacy, so the surface slated for removal is the only write surface and the only place write-side authorization can be enforced.
- **AR-016** — `change-request.requested-by` ships a `create-default` of the seeded administrator UUID, which is also the stub-actor UUID, extending THR-015's attribution ambiguity from non-HTTP writes into a user-facing accountability field.

### Missed-finding candidates

- AR-015 — Authorized API record deletion destroys the record and its attribution together, with no durable event.
- AR-016 — The shipped `requested-by` create-default names the seeded administrator, which is also the stub actor identity.

### Unresolved disagreements

None. All twelve iteration 1 critiques were resolved by evidence, and I found no Sol position in iteration 2 that survives challenge as wrong. AR-013 through AR-016 are new critiques raised at the final adversarial pass, so Sol has taken no contrary position on them; they are not disagreements and must not be counted as such. They proceed to consolidation with the treatment recorded in section 17. This review requests no further automated Sol or Opus pass.

### Pre-existing weaknesses requiring renewed attention

Full-review mode assigns no change provenance; every weakness discussed exists at the pinned commit. Three items deserve to stay visible rather than being absorbed:

- The stub-actor-equals-seeded-admin collision remains folded inside SR-009 alongside direct database authority. It is a distinct, structural, permanent attribution defect, it is invoked during migration by `schema/migrate.py:106-115`, and AR-016 now shows it has already leaked into a domain field's shipped default. It should not disappear behind the broader accountability finding.
- The absence of any product-side security event stream is claimed by SR-009 and SR-007 but is evidenced only for direct SQL and for reads. AR-015 shows the gap also covers authorized destructive writes, which is the case with no recovery path at all.
- The legacy record surface is correctly kept visible by SR-014, but its Informational label now rests on an impact and likelihood pair that produces Low (AR-013) and on a parity description that is inaccurate in a second respect (AR-014).

## 4. Independent security view

### Relevant attack surfaces and trust boundaries

- **Unauthenticated HTTP to the API (TB-004).** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /`, `GET /health`, and the FastAPI defaults `/docs`, `/redoc`, `/openapi.json`. `main.py:18-28` constructs `FastAPI()` with no `docs_url`, `redoc_url` or `openapi_url` override, and `register_request_validation_handlers` is the only handler registered. Both `/auth/refresh` and `/auth/logout` are unauthenticated by design and act solely on a presented opaque refresh token; I re-verified that both resolve it through a SHA-256 digest lookup, so neither is guessable.
- **Unauthenticated HTTP to the web tier (TB-001).** The `/login` loader and action, and the SSR gate on every other route. The loader redirects to a caller-influenced `next` value when a session already exists.
- **Authenticated API to record data (TB-005).** One `require_class_operation` dependency per route in `records/router_factory.py`, applied identically on both surfaces. Create, update and delete are built only for `surface == "legacy"`; v1 provides search and fetch only. `permission_grants` treats `admin` as allow-all.
- **Search compiler to PostgreSQL (TB-006).** `persistence/search.py` — client-controlled projection, predicate tree, sort list, limit and offset compiled to parameterized SQL against definition-validated identifiers. `limit` is bounded `ge=1, le=200` at the model and again in the compiler; `offset` is bounded only `ge=0`.
- **FK enrichment joins (TB-005/TB-006).** `persistence/fk_enrichment.py` LEFT JOINs the referenced table for every projected FK column, including the injected `created_by` and `updated_by` audit columns, which always target `user`. The shipped domain FKs are `incident.assigned_user_id`, `change_request.assigned_user_id` and `change_request.requested_by`, all targeting `user`, plus `demo_link.demo_item_id`.
- **Class definitions to DDL and to generated code (TB-009).** `mapping/definition.py` validates every class and attribute name against a strict kebab-case rule whose segments must be alphanumeric, resolves types against a closed vocabulary, and rejects unknown keys. `schema/ddl.py` composes every identifier through `psycopg.sql.Identifier` and takes SQL type text only from the closed `YAML_TO_POSTGRES` map. `mapping/emit_pydantic.py` escapes backslashes and triple quotes before emitting docstrings. I examined this boundary specifically for DDL and Python code injection from configuration and found none.
- **Operator CLI to PostgreSQL (TB-007).** `schema/cli.py` and `seed/cli.py`, both using the same `connect()` credential the API runtime uses, and both printing it.
- **Process environment to secrets (TB-008).** `auth/settings.py:15-20` returns a published literal when `UNTANGLED_JWT_SECRET` is unset; `persistence/connection.py` returns published credentials when `DATABASE_URL` is unset; the web tier's `require_session_secret()`, `assert_web_auth_config()` and `cookie_secure_from_env()` all refuse to guess.
- **Container runtime.** Neither final image declares `USER`; both run as root. Compose declares no capability drop, read-only filesystem, or `no-new-privileges`.

### Plausible attack chains

1. **Anonymous schema to database-container execution.** `GET /openapi.json` maps every route and model. If `UNTANGLED_JWT_SECRET` is defaulted, mint an HS256 token for the published admin UUID; if port 5432 is reachable with defaulted credentials, connect directly. The role is the Compose bootstrap superuser, so the direct branch reaches `COPY … FROM PROGRAM` and server-side file access rather than stopping at the data. Sol records this chain as "Silent-default host takeover" and it is correct.
2. **Forged administrator to silent destruction.** The same forged or stuffed admin token satisfies `require_class_operation(class, "delete")`, because `admin` is allow-all. Each `DELETE /incidents/{locator}` removes the row and its `created_by`, `updated_by` and timestamps in one statement. Afterwards there is no product-side artefact of the record's existence or of its removal, and the product supplies no backup capability. This chain is absent from both reports and is the substance of AR-015.
3. **Browser-only operator to database exhaustion.** Under ADR 002 an operator holds no Bearer token, only an `httpOnly` cookie. The list action forwards an arbitrary `predicate` blob and an arbitrary non-negative `offset` to `POST /api/v1/{collection}/search`. One form submission can carry roughly 2,500 catastrophic regular expressions, evaluated once for the mandatory `COUNT(*)` across the whole class and again for the paged SELECT. Sol now records this correctly.
4. **Low-privilege reader to operator directory.** With only `incident:read`, project `created_by` and `updated_by` through the v1 search route, page with `total`, and collect enrichment display values. Sol now records this as SR-016.
5. **Login flood to full-platform denial.** Every API handler is a synchronous `def`, so all share one bounded anyio worker pool, and Argon2id at library defaults costs 64 MiB per verification. Saturating the pool denies the record routes as well as login, and each request opens its own unpooled connection. Sol now records the shared pool.
6. **Authenticated session to attacker origin in one click.** `GET /login?next=/\attacker.example/` with an existing session: `safe_next_path` accepts the value and the loader throws `redirect(next)`. Sol now rates this half at Medium.

### Legitimate-user abuse paths

- A holder of `incident:read` reading the whole class, including reclassified security incidents, entirely within granted permissions and with no read record. This is the accepted THR-011 abuse case and SR-007 states it correctly.
- The same holder harvesting the operator directory through FK enrichment, indistinguishable from rendering a list that shows who raised each ticket. SR-016 states this correctly.
- An `admin` holder deleting records as ordinary housekeeping and, by doing so, destroying the only evidence that those records ever existed. The platform cannot distinguish routine cleanup from evidence destruction, and nothing records either (AR-015).
- A holder of `change-request:create` filing a change request that names the administrator as the requester, which is both the product's shipped default value for that field and an available deliberate choice (AR-016).
- An operator running a broad `contains` or `regexp` filter from the list chrome and causing the AR-005 amplification with no hostile intent; the code comment at `persistence/search.py:56-58` already anticipates this as performance debt.
- An operator seeding or migrating a real environment and writing the production database password and the effective admin password into a terminal scrollback, a CI log, or a screen share. SR-017 states this correctly.

### Assumptions independently challenged

| Assumption or decision | Evidence examined | Opus assessment | Consequence |
| --- | --- | --- | --- |
| ASM-007 — secrets come from the customer's secret manager and the product fails closed when they are absent | `auth/settings.py:15-30`, `persistence/connection.py`, `frontend/app/auth/config.server.ts:6-45`, `session.server.ts:20-28` | Half true and the halves are inverted by tier. The web tier refuses to run without either of its two required values and throws on an unrecognised `UNTANGLED_COOKIE_SECURE`; the API silently defaults both its signing secret and its database credentials. `_int_env` does raise on non-numeric TTLs, which is the API's one fail-loud behaviour | Confirms SR-001, SR-002 and SR-006; the fail-closed objective is met only where the credential matters least |
| ASM-015 — a durable, tamper-evident, SIEM-exportable audit trail is a requirement | `mapping/system_fields.py`, `persistence/store.py:141-190`, `records/router_factory.py:199-215` | The gap is wider than either report states. The audit columns are latest-writer fields on the row, so `DELETE` removes the attribution together with the data. There is no soft-delete, no tombstone, and no event stream, so an authorized delete is unreconstructable from the product alone | AR-015; the audit requirement is unmet in its strongest case, not merely its ordinary one |
| ASM-019 / ASM-025 — record-level authorization is not designed; attribute-level has an intended direction, with indistinguishability across search, fetch and write validation | `rbac/dependencies.py`, `records/router_factory.py:44-215`, `persistence/search.py:137-145` | Accurate, with a structural obstacle neither assumption names: write validation lives only on the deprecated legacy surface, because v1 has no create, update or delete. Any future write-side rule must be built on the surface issue #117 exists to delete | AR-014; the intended design's write half has nowhere stable to live yet |
| ASM-024 — UUID and friendly-id values are provisionally non-sensitive, with FK view inheritance a candidate refinement | `persistence/fk_enrichment.py:56-158`, `user.yaml`, `incident.yaml`, `change-request.yaml` | Conditions changed, as Sol now records. My independent inventory bounds the present exposure precisely: every enrichment-reachable target today is `user`, whose display attribute is `display-name` and which has no friendly-id, so display names are the whole of it. This validates Sol's Low impact rather than weakening it | SR-016 is correctly rated; the refinement remains a present gap whose severity is driven by likelihood |
| ASM-021 / THR-027 — class tiering will bound configuration authority | `backend/class-definitions/` contains no tier marking; `demo-item.yaml` and `demo-link.yaml` sit beside `user.yaml` and `incident.yaml` | Confirmed unbuilt, as the threat model states and as Sol's coverage table now records without attaching a finding. Independently, `demo-link` references `demo-item`, so the two demo definitions cannot be removed separately — `_validate_references` raises if a reference target is absent | SR-019 stands; its recommendation needs the two demo classes removed together |
| ASM-023 / ADR 002 — the web tier is a candidate customization host | `session.server.ts`, `api.server.ts:26-90`, `login.tsx`, `frontend/Dockerfile` | The concentration THR-028 warns about is verified in code and Sol now records it as SR-018 with the accepted trade preserved. The refresh-token discard at `api.server.ts:46-50` genuinely holds and is correctly credited | SR-018 is well formed; the concentration is now visible as ADR 002's acceptance requires |
| TB-009 — configuration authority reaches DDL, with class tiering as the intended boundary control | `mapping/definition.py:130-477`, `schema/ddl.py`, `persistence/sql_types.py`, `mapping/emit_pydantic.py` | Better than the absence of tiering would suggest. Names are constrained to alphanumeric kebab segments, types resolve through a closed map, identifiers are composed rather than interpolated, and generated docstrings escape their delimiters. A hostile definition can break a build; I found no path to DDL or Python injection | No critique. Recorded so consolidation knows this boundary was examined and produced nothing |

## 5. Critique method

### Implementation evidence examined

| Evidence | Revision or location | Purpose |
| --- | --- | --- |
| Accepted threat model | Pinned Git object at `f074efd`; SHA-256 verified against manifest | Governing scope, threats, assumptions, and the section 9 rating matrix |
| Sol iteration 1 review, Opus iteration 1 review, Sol iteration 2 review | Run directory; all three SHA-256 values verified | The artefacts under critique and the ledger continuity they must preserve |
| Run manifest | Run directory | Confirm pinned inputs, phase ledger, and that iteration 2 is attempt 1 |
| Pipeline templates | `security-review.template.md`, `findings.template.md`, `adversarial-review.template.md` | Establish the severity vocabulary the next phase must consume (AR-013) |
| Token, session and login handling | `auth/settings.py`, `auth/tokens.py`, `auth/dependencies.py`, `auth/store.py`, `auth/passwords.py`, `auth/routes.py` | Re-verify SR-001, SR-003, SR-004; test claim requirements, refresh entropy and digest, rotation atomicity, and the unauthenticated refresh and logout routes |
| Authorization | `rbac/keys.py`, `rbac/dependencies.py`, `rbac/store.py`, `records/router_factory.py`, `records/locator.py`, `seed/rbac_catalog.py` | Re-verify SR-007 and SR-014; establish which seeded roles hold which operations; test the write-surface asymmetry |
| Search and projection | `persistence/search.py`, `records/search_models.py`, `persistence/fk_enrichment.py` | Re-derive the AR-005 multiplier from the depth and length constants; inventory every enrichment-reachable target class |
| Record mutation | `persistence/store.py`, `records/deps.py` | Establish whether deletion is hard or soft and what evidence survives it (AR-015) |
| Class definitions and code generation | `backend/class-definitions/*.yaml`, `mapping/definition.py`, `mapping/naming.py`, `mapping/emit_pydantic.py`, `persistence/sql_types.py`, `schema/ddl.py` | Test the configuration-to-DDL and configuration-to-code boundaries for injection; find the `requested-by` create-default (AR-016) |
| Schema and operator paths | `schema/migrate.py`, `schema/cli.py`, `schema/versions.py`, `seed/cli.py`, `seed/users.py` | Verify SR-015 and SR-017 evidence lines, including that the restore point is unconditional for non-empty plans |
| SSR web tier | `frontend/app/auth/*`, `routes/login.tsx`, `routes/authenticated.tsx`, `routes/destination_list.tsx`, `routes/destination_new.tsx`, `frontend/app/generated/field_meta.ts` | Verify SR-005, SR-006, SR-018; confirm whether a create surface consumes the shipped create-default (bounds AR-016) |
| Deployment and dependencies | `compose.yaml`, both Dockerfiles, `backend/requirements.lock`, `frontend/package-lock.json` | Verify SR-002, SR-006, SR-012, SR-018, SR-019 |
| Repository-wide absence checks | `rg` for `USER` directives, `add_middleware`, `statement_timeout`, `headers` route exports, `create_default` consumers | Confirm or refute material negative claims in both reports |

### Standards used

| Standard | Specific section or control | Application |
| --- | --- | --- |
| OWASP ASVS 5.0 | V1 Architecture, V4 Access Control, V7 Logging and Error Handling, V14 Configuration | AR-014, AR-015, AR-016 |
| OWASP Top 10:2021 | A01 Broken Access Control, A09 Security Logging and Monitoring Failures | AR-015, AR-016 |
| CWE | CWE-778 insufficient logging, CWE-212 improper removal of sensitive information, CWE-1284/CWE-451 misleading representation, CWE-250 excessive privilege, CWE-863 incorrect authorization | Critique classification |
| PostgreSQL documentation | `pg_create_restore_point` privilege requirement; `COPY … FROM PROGRAM` superuser or `pg_execute_server_program` requirement; backtracking regular-expression engine | Verification of SR-008 and SR-015 |
| WHATWG URL Standard | Backslash treated as a path separator during special-scheme parsing | Verification of SR-005 |
| Untangled pipeline templates | `findings.template.md` impact and likelihood vocabulary — `Not applicable for Informational only` | AR-013 |
| Untangled AGENTS.md | Section 3.9 API compatibility cleanup — deprecation conditions must be recorded, not left in comments or memory | AR-014 |

### Rating basis

Candidate ratings use the accepted threat model's section 9 impact and likelihood definitions and its priority matrix. Every candidate severity stated is the plain matrix result and no candidate severity in this review is elevated, so the elevation field is `None` throughout. Where a critique concerns the report's own accounting rather than a system weakness, impact, likelihood and severity are recorded as `Not applicable` rather than as `Informational`, which is the distinction AR-013 asks Sol to adopt and which this review therefore applies to itself. AR-016's impact is calibrated by explicit parity with the accepted model's own rating of THR-015 rather than asserted independently, and that reasoning is stated in the record.

## 6. Critique summary

| Disposition | ID | Critique | Type | Related Sol findings | Candidate severity | Human review |
| --- | --- | --- | --- | --- | --- | --- |
| Addressed | AR-001 | Shared database role is superuser-equivalent by product requirement | Missed finding | SR-002, SR-009, SR-015 | High | Yes |
| Addressed | AR-002 | FK identity enrichment discloses referenced-class content without a referenced-class check | Missed finding | SR-007, SR-014, SR-016 | Medium | Yes |
| Addressed | AR-003 | Operator CLIs print the database password and effective seed passwords | Missed finding | SR-002, SR-009, SR-017 | Medium | No |
| Addressed | AR-004 | Unbounded login body and password length against a shared bounded worker pool | Missed finding | SR-003 | High | No |
| Addressed | AR-005 | Search guardrails permit large per-request amplification; COUNT doubles it; offset is unbounded | Missed finding | SR-007, SR-008 | High | No |
| Addressed | AR-006 | SR-006 narrowed an accepted threat-model claim on unverified evidence and omitted the API tier | Evidence | SR-006 | Medium | Yes |
| Addressed | AR-007 | SR-005 merged two weaknesses of different likelihood and rated both at the lower one | Rating | SR-005 | Medium | No |
| Addressed | AR-008 | Finding table and coverage table disagreed about which forward-looking threats were analysed | Coverage | SR-011, SR-012, SR-018 | Not applicable | No |
| Addressed | AR-009 | THR-024 web-tier credential concentration had no finding of its own | Coverage | SR-012, SR-018 | Medium | Yes |
| Addressed | AR-010 | Prior accepted-risk table asserted a tolerance rationale where no tolerance decision exists | Prior acceptance | SR-001 to SR-013 | Not applicable | No |
| Addressed | AR-011 | Demo class definitions, demo permissions, and the RBAC probe ship in the production surface | Missed finding | SR-010, SR-019 | Low | No |
| Addressed | AR-012 | Access-token validation requires no `exp`, `iat`, issuer or audience claim | Missed finding | SR-001, SR-004 | Low | No |
| New | AR-013 | `Informational` severity is recorded alongside matrix-producing impact and likelihood, and the derived counts do not follow from the records | Rating | SR-014, SR-019 | Not applicable | No |
| New | AR-014 | SR-014 treats the record surfaces as parallel; create, update and delete exist only on the deprecated legacy surface | Evidence | SR-014, SR-016 | Not applicable | Yes |
| New | AR-015 | Authorized API record deletion destroys the row and its attribution together, with no durable event | Missed finding | SR-009, SR-007, SR-011 | Medium | Yes |
| New | AR-016 | The shipped `requested-by` create-default names the seeded administrator, which is also the stub actor identity | Missed finding | SR-009 | Low | No |

This table is derived from the detailed critique records, which are authoritative.

## 7. Detailed critiques

### AR-001 — Shared database role is superuser-equivalent by product requirement

- Iteration disposition: Addressed
- Critique type: Missed finding
- Related Sol findings: SR-002, SR-009, SR-015
- Related threats: THR-002, THR-014, THR-020, THR-021
- Related security requirements: None
- Candidate impact: Critical
- Candidate likelihood: Medium
- Candidate severity: High
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

Iteration 2 creates SR-015 at High (Critical impact, Medium likelihood), revises SR-002's impact justification to include database-container command and file authority, and revises SR-009's recommendation to make role separation "subject to SR-015's restore-point constraint".

#### Opus challenge

The iteration 1 challenge is met in full and I re-verified the mechanism independently rather than accepting Sol's restatement. `schema/migrate.py:100-103` calls `create_restore_point` unconditionally once a plan is non-empty and before any DDL executes, so there is no code path that applies a migration without it. `schema/versions.py:58-66` executes `SELECT pg_create_restore_point(%s)` and its docstring states the superuser requirement and that local Compose `untangled` is a superuser. `compose.yaml` provisions `POSTGRES_USER: untangled`, which the official image creates as the bootstrap superuser, and publishes 5432. `persistence/connection.py` is the single `connect()` entry point shared by the API dependency and both CLIs.

Sol's phrasing is also more precise than mine was: it says the attacker "pivots within the database container", which correctly locates `COPY … FROM PROGRAM` execution as the database server's operating-system identity rather than implying host compromise generally. I withdraw nothing, but I record that Sol's wording is the better one.

#### Evidence

- `backend/src/untangled/schema/migrate.py:95-103` — destructive gate, then `version_id`, then unconditional `create_restore_point` before the op loop.
- `backend/src/untangled/schema/versions.py:58-66` — the call and its documented privilege requirement.
- `backend/src/untangled/persistence/connection.py` — single `connect()`; `schema/cli.py:54` and `seed/cli.py:27` both use it, as does `auth/dependencies.py:21-27`.
- `compose.yaml:6-11` — `POSTGRES_USER: untangled` and the published port.
- Sol `security-review.md:1179-1250` — SR-015 in full.

#### Attack path or disconfirming path

1. Unchanged from iteration 1: reach PostgreSQL with the defaulted credential, or compromise the API process, and inherit the bootstrap superuser role.
2. Disconfirming path unchanged and still open: a customer-provisioned non-superuser runtime with a separately privileged migration identity removes the escalation. Nothing in the product requires, checks, or documents that split.

#### Legitimate-user abuse case

An infrastructure operator (ACT-005) already holds this reach legitimately, which is THR-014. The new element Sol now records is that the application process holds it too.

#### Prior decision or acceptance

- Decision reference: None as a security decision
- Recorded rationale: `docs/class-definitions.md` and the `versions.py` docstring record the privilege requirement as an operational caveat
- Current applicability: Rationale undocumented — the operational caveat exists and Sol's section 11 row now records exactly that

#### Requested resolution

Consolidation should carry SR-015 as substantiated, with the two open human questions Sol records: whether the product will guarantee a non-superuser runtime, and whether restore-point creation becomes optional or separately privileged.

#### Final adversarial position

Resolved by evidence. SR-015's claim, evidence, rating and recommendation all survive independent checking. The remaining uncertainty is the customer's production role design, which is outside repository evidence and which Sol records honestly.

### AR-002 — FK identity enrichment discloses referenced-class content without a referenced-class check

- Iteration disposition: Addressed
- Critique type: Missed finding
- Related Sol findings: SR-007, SR-014, SR-016
- Related threats: THR-011, THR-012, THR-026
- Related security requirements: None
- Candidate impact: Low
- Candidate likelihood: High
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

Iteration 2 creates SR-016 at Medium (Low impact, High likelihood), keeps SR-007 for same-class extraction, and narrows SR-014's parity claim to authorization dependencies rather than response content.

#### Opus challenge

Addressed, and Sol's rating is better supported than my iteration 1 reasoning. I asked Sol to inventory which classes are reachable through enrichment and whether any carries content more sensitive than a display name. I performed that inventory independently: the shipped domain foreign keys are `incident.assigned_user_id`, `change_request.assigned_user_id` and `change_request.requested_by`, all referencing `user`, plus the injected `created_by` and `updated_by`, which `resolve_fk_fields` hard-codes to `user`, plus `demo_link.demo_item_id`. `user.yaml` sets `display-attribute: display-name` and declares no friendly-id, and `build_enriched_read_plan` selects only the target's display and friendly columns. So the whole of the present disclosure is user display names, exactly as Sol states, and `username` and `password-hash` are genuinely unreachable through this path.

That makes Low impact correct rather than conservative, and it means the severity is driven entirely by likelihood, which is High because enrichment is unconditional on ordinary v1 reads. Sol's recommendation — check referenced-class authority before enriching and return the same non-existence representation used for inaccessible content — is the minimal control and is aligned with ASM-025's indistinguishability principle.

#### Evidence

- `backend/src/untangled/persistence/fk_enrichment.py:56-72` — projected FKs plus hard-coded `created_by` and `updated_by` as `user` references.
- `backend/src/untangled/persistence/fk_enrichment.py:91-158` — display and friendly columns selected, LEFT JOIN emitted per FK.
- `backend/class-definitions/user.yaml` — `display-attribute: display-name`; `username` and `password-hash` are declared but are not the display attribute and have no friendly-id.
- `backend/class-definitions/incident.yaml`, `change-request.yaml` — the only domain FK targets are `user`.
- `backend/src/untangled/seed/rbac_catalog.py:19-23, 137-139` — `incident-read-only` holds exactly `incident:read`; no `user` permission is minted.
- Sol `security-review.md:1252-1323` — SR-016 in full.

#### Attack path or disconfirming path

1. Unchanged: authenticate with `incident:read` only, project `created_by` and `updated_by` on the v1 search route, page by `total`.
2. Disconfirming path re-examined and still rejected: enriched columns cannot be used in predicates or sort keys, so the exposure is projection-only. That bound is why Low impact holds.

#### Legitimate-user abuse case

Rendering "raised by" on a ticket list is intended behaviour; the same request paged to exhaustion is directory harvesting, and the platform cannot distinguish them. Sol states this.

#### Prior decision or acceptance

- Decision reference: ASM-024
- Recorded rationale: identifiers provisionally non-sensitive, with FK view inheritance named as a candidate refinement
- Current applicability: Conditions changed — the implemented surface returns referenced-record content, not identifiers. Sol's section 11 row records this correctly

#### Requested resolution

Consolidation should carry SR-016 as substantiated at Medium, with the human design question about exact reference-visibility semantics that Sol records.

#### Final adversarial position

Resolved by evidence, with the impact rating independently corroborated. Residual uncertainty is forward-looking only: when CMDB and integration-credential classes acquire foreign keys, the same mechanism will reach higher-value targets and the impact will need re-rating.

### AR-003 — Operator CLIs print the database password and effective seed passwords

- Iteration disposition: Addressed
- Critique type: Missed finding
- Related Sol findings: SR-002, SR-009, SR-017
- Related threats: THR-002, THR-014, THR-017
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Medium
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

Iteration 2 creates SR-017 at Medium, states explicitly that `password_for(seed)` returns the environment override rather than only the published default, and records in its own disagreement note that iteration 1 described the output incorrectly.

#### Opus challenge

Addressed. I re-verified all three prints: `schema/cli.py:51` emits `migrate: database={database_url()}`, `seed/cli.py:26` emits `seed: database={database_url()}`, and `seed/cli.py:34-39` emits, per principal, `password from {seed.password_env} or default {password_for(seed)!r}`, where `seed/users.py:75-77` returns `os.environ.get(seed.password_env, seed.default_password)`. There is no redaction helper anywhere in `persistence/connection.py` and no verbosity guard on any of the prints. Sol's recommendation — never print secret values, redact URL credentials, report only which variable was consulted — is the minimal control and correctly notes that SR-002's generated-credential remedy would otherwise make this worse.

#### Evidence

- `backend/src/untangled/schema/cli.py:51`, `backend/src/untangled/seed/cli.py:26, 34-39`, `backend/src/untangled/seed/users.py:75-77`.
- Sol `security-review.md:1325-1395` — SR-017 in full.

#### Attack path or disconfirming path

1. Unchanged: an operator supplies real secrets, runs migrate or seed, and the values land in scrollback, CI logs, or a screen share.
2. Disconfirming path re-examined and still rejected: no redactor, no logging framework with a scrubbing filter, unconditional prints.

#### Legitimate-user abuse case

An operator pastes failed migration output into a ticket or chat. Sol states this.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None
- Current applicability: Not applicable

#### Requested resolution

Consolidation should carry SR-017 as substantiated at Medium.

#### Final adversarial position

Resolved by evidence. No residual uncertainty.

### AR-004 — Unbounded login body and password length against a shared bounded worker pool

- Iteration disposition: Addressed
- Critique type: Missed finding
- Related Sol findings: SR-003
- Related threats: THR-003, THR-004, THR-005
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: Medium
- Candidate severity: High
- Rating elevation: None
- Confidence: Medium
- Human review required: No

#### Sol position

SR-003 is revised: the claim now names the absent body and password bounds and the shared synchronous worker pool, likelihood rises to High, and the recommendation orders the controls — bound body and password length before hashing, then throttle and budget hash concurrency, then add a dummy verification.

#### Opus challenge

Addressed, including the specific interaction I flagged: Sol's disconfirming-evidence line states that "a dummy hash alone would increase attacker work unless input is bounded first", and the recommendation sequences the controls accordingly. I re-verified that every record handler in `records/router_factory.py` and the `login` handler in `auth/routes.py` are synchronous `def`, that `PasswordHasher()` uses library defaults, that `authenticate_user` returns before verification for unknown or inactive users, that `backend/Dockerfile:27` sets no concurrency or body limit, and that `main.py` registers no middleware other than the validation handler.

One nuance worth recording rather than disputing: Sol raised likelihood from Medium to High. I had left SR-003's rating alone and challenged only its mechanism. The raise is defensible — no credential is required and the shared pool gives each expensive login cross-route reach — and it does not change the matrix result, since High impact with either likelihood yields High. I do not contest it.

#### Evidence

- `backend/src/untangled/auth/routes.py:42-52`; `records/router_factory.py:47, 85, 160, 180, 200`; `auth/passwords.py`; `auth/store.py:55-62`; `backend/Dockerfile:27`; `backend/src/untangled/main.py:18-34`.
- Sol `security-review.md:310-381` — SR-003 in full.

#### Attack path or disconfirming path

1. Unchanged: concurrent oversized-password logins for a known-valid username saturate the shared pool and starve the record routes.
2. Disconfirming path re-examined and still rejected: no rate limiter, concurrency cap, body-size limit, or middleware exists anywhere in the backend.

#### Legitimate-user abuse case

None meaningful; this is an unauthenticated path, matching THR-004.

#### Prior decision or acceptance

- Decision reference: ASM-006, issue #33
- Recorded rationale: rate limiting belongs in the product; the assumption warns that a login-only implementation leaves THR-004 untouched
- Current applicability: Still supported, and Sol's revised recommendation now addresses the warning the assumption contains

#### Requested resolution

Consolidation should carry SR-003 as substantiated at High with the sequenced recommendation intact, since the ordering is the part that makes it safe.

#### Final adversarial position

Resolved by evidence. Confidence stays Medium because saturation thresholds remain unmeasured, which both reports record.

### AR-005 — Search guardrails permit large per-request amplification, and COUNT doubles it

- Iteration disposition: Addressed
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

SR-008 is revised: likelihood rises to High, the claim quantifies roughly 2,500 regexp leaves per request, records the unconditional full-class `COUNT(*)`, the unbounded offset and sort-key count, and the browser reachability of both through the list action, and the recommendation adds predicate-count, pattern, sort-key and offset caps alongside a statement timeout.

#### Opus challenge

Addressed, and I re-derived the multiplier from the code rather than restating it. `_compile_predicate` is entered at `depth=1` and raises only when `depth > MAX_SEARCH_NESTING_DEPTH` (3); `_compile_logical_list` accepts up to `MAX_SEARCH_NESTING_LENGTH` (50) children and compiles each at `depth + 1`. A root `and` at depth 1 with fifty `or` children at depth 2, each holding fifty leaves at depth 3, is therefore the maximum legal shape and yields exactly 2,500 leaves; a `not` at depth 3 would push its child to depth 4 and be rejected. The figure is correct and is a ceiling, not an estimate. `execute_search` compiles the same predicate a second time for an unconditional `SELECT COUNT(*)`, and `SearchRequest` bounds `limit` at `le=200` but `offset` only at `ge=0`.

#### Evidence

- `backend/src/untangled/persistence/search.py:26-30` — the two constants.
- `backend/src/untangled/persistence/search.py:340-343, 354-357, 405-438` — depth entry at 1, the depth guard, the fifty-child limit, and child compilation at `depth + 1`.
- `backend/src/untangled/persistence/search.py:172-179, 231-239` — the unconditional COUNT compiled from the same predicate and executed before the paged SELECT.
- `backend/src/untangled/records/search_models.py:56-57` — `limit` bounded above, `offset` not.
- `frontend/app/routes/destination_list.tsx:195-222`, `frontend/app/list/pagination.ts:154-186` — browser reachability.
- Sol `security-review.md:674-746` — SR-008 in full.

#### Attack path or disconfirming path

1. Unchanged: one search whose predicate is a fifty-by-fifty tree of non-matching catastrophic patterns, evaluated across the class twice.
2. Disconfirming path re-examined and still rejected: no `statement_timeout`, connection pool, cost estimation, or per-principal budget exists. `_escape_like_literal` genuinely bounds `contains`, `starts-with` and `ends-with` to sequential scans, which does not apply to `regexp`.

#### Legitimate-user abuse case

Unbounded offset and unbounded sort-key count are both reachable by ordinary UI use at scale. Sol states this.

#### Prior decision or acceptance

- Decision reference: THR-013 open question in TM-REV-001 section 15
- Recorded rationale: `regexp` is worth keeping, so the answer must be mitigation rather than removal
- Current applicability: Still supported, and Sol's recommendation now bounds predicate count as well as per-pattern cost

#### Requested resolution

Consolidation should carry SR-008 at High with High likelihood.

#### Final adversarial position

Resolved by evidence, with the multiplier independently re-derived as a hard ceiling. Saturation thresholds remain unmeasured.

### AR-006 — SR-006 narrowed an accepted threat-model claim on unverified evidence

- Iteration disposition: Addressed
- Critique type: Evidence
- Related Sol findings: SR-006
- Related threats: THR-009, THR-023
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Medium
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

SR-006 is revised. The claim now says a loader requests `private, no-store` "but repository evidence does not establish that it reaches SSR document responses"; the disconfirming-evidence line says document-level propagation is "unverified, not credited"; the API tier's complete absence of security and cache headers is added; and section 15 records the iteration 1 narrowing as withdrawn.

#### Opus challenge

Addressed in exactly the way the critique asked, and the honest way: Sol did not manufacture evidence it does not have, and it did not quietly retain the narrowing. I re-confirmed that no route in `frontend/` exports a `headers` function, that the only `Cache-Control` assignment is the `data()` call in the authenticated layout loader, that its unit test asserts a loader object rather than an HTTP response, and that `main.py` registers no middleware, so no API response carries any security or cache header. Confidence on the critique rises from Medium to High because the evidentiary position is now stated correctly by both parties.

#### Evidence

- `frontend/app/routes/authenticated.tsx:36-39`; repository-wide search for `export function headers` in `frontend/` returns nothing; `frontend/app/auth/route_wiring.test.ts:91`.
- `backend/src/untangled/main.py:18-46` — no `add_middleware` call anywhere in the backend.
- Sol `security-review.md:529-599` — SR-006 in full, including the withdrawal.

#### Attack path or disconfirming path

1. Unchanged: an authenticated document containing incident content traverses a shared intermediary that may store it.
2. Disconfirming path unchanged and still open: capture a document response from a built web tier. Neither party did so, and both now say so.

#### Legitimate-user abuse case

None identified. Cache exposure depends on the customer's network path rather than on any user capability.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list; THR-009
- Recorded rationale: ADR 002 leaves open whether `Cache-Control: private, no-store` should be systemic
- Current applicability: Still supported — the systemic question remains open, which is now what both reports say

#### Requested resolution

Consolidation should carry SR-006 at High with the document-header question recorded as an open evidence item, and should not treat THR-009 as narrowed.

#### Final adversarial position

Resolved by evidence, in the sense that the parties now agree the evidence is absent. The substantive question — whether the header reaches the document — is unresolved and belongs to security design, not to another review pass.

### AR-007 — SR-005 merged two weaknesses of different likelihood

- Iteration disposition: Addressed
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

SR-005 rises from Low to Medium. The likelihood justification now separates the two halves explicitly — "CSRF retains Low likelihood; the open redirect has Medium likelihood because it requires only one crafted link and an existing session. The merged finding uses the higher applicable matrix result" — and the attack path leads with the authenticated loader redirect.

#### Opus challenge

Addressed precisely as requested, and Sol chose the option that keeps one record while showing both likelihood justifications and naming the half that drives the severity, which is what consolidation needs. I re-verified `next_path.ts:5-15` rejects only `startsWith("//")` and `includes("://")` after requiring a leading slash, so `/\evil.example/path` passes, and `login.tsx:16-24` redirects an existing session to the accepted value with no further validation.

#### Evidence

- `frontend/app/auth/next_path.ts:5-15`; `frontend/app/routes/login.tsx:16-24, 26-54`; `frontend/app/auth/auth.test.ts` covers absolute and protocol-relative cases only.
- WHATWG URL Standard: for special schemes, `\` is treated as `/` during parsing.
- Sol `security-review.md:457-527` — SR-005 in full.

#### Attack path or disconfirming path

1. Unchanged: a signed-in operator follows one genuine-domain link and lands on the attacker origin.
2. Disconfirming path unchanged: the cookie is host-scoped and is not sent cross-origin, so this is phishing and misdirection rather than credential capture, which is why impact stays Medium.

#### Legitimate-user abuse case

An account holder inducing another operator to work in the wrong session. Sol states this.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list, issue #67
- Recorded rationale: login CSRF is explicitly deferred; the redirect-normalisation defect is covered by no prior decision
- Current applicability: Still supported for the CSRF half; Not applicable to the redirect half. Sol's section 11 no longer asserts otherwise

#### Requested resolution

Consolidation should carry SR-005 at Medium and preserve the split likelihood justification, because a remediation designer needs to know the redirect half drives the rating.

#### Final adversarial position

Resolved by evidence. No residual uncertainty.

### AR-008 — Finding table and coverage table disagreed about which forward-looking threats were analysed

- Iteration disposition: Addressed
- Critique type: Coverage
- Related Sol findings: SR-011, SR-012, SR-018
- Related threats: THR-018, THR-019, THR-025, THR-027, THR-028
- Related security requirements: None
- Candidate impact: Not applicable
- Candidate likelihood: Not applicable
- Candidate severity: Not applicable
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-011 drops THR-027 and SR-012 drops THR-019; both findings record the removal in their disagreement notes; and the coverage table now lists THR-018, THR-019, THR-025 and THR-027 as `Insufficient evidence` with no finding attached.

#### Opus challenge

Addressed. The two tables now agree for both threats I named, and SR-011's claim even states that "future tier enforcement is not analyzed by this finding and remains a gap under THR-027", which is the honest form.

One residual, recorded rather than pressed: SR-018's summary row lists `THR-024, THR-028` in its related-threats column, while the coverage table marks THR-028 `Insufficient evidence`. Sol qualifies the coverage row with "SR-018 is decision input only", which is exactly the distinction I asked for elsewhere, so the two statements do not actually contradict each other. But a consolidator scanning only the finding summary will read THR-028 as addressed. The fix is one qualifying word in the summary row, not a change to any finding.

#### Evidence

- Sol `security-review.md:150-151, 157-158` — the revised summary rows for SR-011, SR-012 and SR-018.
- Sol `security-review.md:915, 963, 1035` — the explicit removals and the SR-011 THR-027 disclaimer.
- Sol `security-review.md:1606-1616` — the coverage rows for THR-018, THR-019, THR-025, THR-027 and THR-028.

#### Attack path or disconfirming path

Not applicable; this concerns the report's own accounting.

#### Legitimate-user abuse case

Not applicable.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None
- Current applicability: Not applicable

#### Requested resolution

Consolidation should treat THR-018, THR-019, THR-025 and THR-027 as design-stage coverage gaps with no finding, and should treat SR-018 as bearing on THR-024 with THR-028 as a decision input only, per Sol's coverage row rather than its summary row.

#### Final adversarial position

Resolved by evidence, with a cosmetic residual in the summary row that consolidation can settle without further analysis.

### AR-009 — THR-024 web-tier credential concentration had no finding of its own

- Iteration disposition: Addressed
- Critique type: Coverage
- Related Sol findings: SR-012, SR-018
- Related threats: THR-024, THR-021, THR-028
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: Low
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

Iteration 2 creates SR-018 at Medium (High impact, Low likelihood), states the verified concentration facts, credits the refresh-token discard, notes the root container, and records the concentration as a standing input to the THR-028 host decision while explicitly not reopening ADR 002.

#### Opus challenge

Addressed, and framed better than I asked for: SR-018's claim ends with "This is a verified blast-radius property requiring a prior compromise, not a claim that ADR 002's browser isolation choice is wrong", which preserves the accepted trade while making the cost visible — the condition TM-REV-001 attaches to that acceptance. I re-verified each fact: `session.server.ts:20-47` makes the SSR process the sole holder of the cookie signing secret and stores the access JWT in the cookie it signs; `api.server.ts:65-80` attaches the Bearer token for every authenticated request; `api.server.ts:26-51` handles the plaintext username and password and explicitly discards the refresh token; and `frontend/Dockerfile` declares no `USER`, so this process runs as root.

#### Evidence

- `frontend/app/auth/session.server.ts:20-47`; `frontend/app/auth/api.server.ts:26-51, 65-90`; `frontend/app/routes/login.tsx`; `frontend/Dockerfile:38-47`.
- Sol `security-review.md:1397-1468` — SR-018 in full.

#### Attack path or disconfirming path

1. Unchanged: SSR code execution yields the signing secret, every token in flight, and the credentials of everyone who signs in while resident.
2. Disconfirming path re-examined: the `.server.ts` convention and the refresh discard genuinely limit the attacker, and Sol credits both; neither prevents secret or token access within the process.

#### Legitimate-user abuse case

Not applicable today; it becomes direct legitimate-author misuse if the web tier is chosen as the customization host. Sol states this.

#### Prior decision or acceptance

- Decision reference: ADR 002 / THR-024
- Recorded rationale: the accepted cost of ADR 002, recorded so the concentration is visible rather than to reopen the decision
- Current applicability: Still supported, and the visibility condition is now met by SR-018 rather than defeated by placement inside a dependency finding

#### Requested resolution

Consolidation should carry SR-018 at Medium and forward its THR-028 input role to security design.

#### Final adversarial position

Resolved by evidence. No residual uncertainty on the facts; the host decision itself is a human and design matter.

### AR-010 — Prior accepted-risk table asserted a tolerance rationale where none exists

- Iteration disposition: Addressed
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

Section 11 now opens by stating that TM-REV-001 accepts no individual risk, records explicitly that SR-001 to SR-013, SR-015 to SR-017 and SR-019 have no prior tolerance decision to reassess, contains rows only for the four findings with real prior decisions, and closes with "AR-010 is accepted: the iteration-1 row asserting an undocumented tolerance rationale for SR-001–SR-013 was erroneous and is not repeated."

#### Opus challenge

Addressed in full. The thirteen spurious human-review entries are gone, and the four remaining rows each reference a real recorded decision: issue #117 for SR-014, the documented restore-point caveat for SR-015, ASM-024 for SR-016, and ADR 002 / THR-024 for SR-018. I examined the SR-015 row's verdict of `Rationale undocumented` specifically, because that is the vocabulary the original critique objected to. It is used correctly here: an operational rationale genuinely exists in the code docstring and documentation, and its security rationale genuinely does not, which is what the verdict means. I originated that phrasing in iteration 1 and I still consider it right for this row.

#### Evidence

- Sol `security-review.md:1648-1659` — the revised section 11 in full.
- TM-REV-001 section 15 — no item designated tolerate-rather-than-remediate.

#### Attack path or disconfirming path

Not applicable; this concerns the report's own accounting.

#### Legitimate-user abuse case

Not applicable.

#### Prior decision or acceptance

- Decision reference: TM-REV-001 section 15
- Recorded rationale: acceptance of the revision was acceptance of its description, not of any risk within it
- Current applicability: Still supported, and now stated correctly in both prose and table

#### Requested resolution

Consolidation should inherit four prior-acceptance reconsiderations, not seventeen, and zero prior-acceptance-grounded human decisions for SR-001 to SR-013.

#### Final adversarial position

Resolved by evidence. No residual uncertainty.

### AR-011 — Demo class definitions, demo permissions, and the RBAC probe ship in the production surface

- Iteration disposition: Addressed
- Critique type: Missed finding
- Related Sol findings: SR-010, SR-019
- Related threats: THR-016, THR-018, THR-027
- Related security requirements: None
- Candidate impact: Low
- Candidate likelihood: Low
- Candidate severity: Low
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

Iteration 2 creates SR-019 as a separate record, states that a non-empty production migration plans the demo tables, and keeps SR-010 for the anonymous schema surface with a cross-reference.

#### Opus challenge

Addressed on substance. I re-verified that both demo definitions sit in the default definitions directory with no marking, that `load_definitions` loads every `*.yaml` present and `migrate` reconciles the database to all of them, that `SEEDED_PERMISSION_CLASSES` leads with `demo-item` so the catalogue mints its four keys, that `_role_permission_keys` attaches `demo-item` permissions to both the `read-only` and `read-write` roles, and that `/auth/rbac-probe` is registered unconditionally on the auth router and gated on `demo-item:read`.

I must correct my own iteration 1 record rather than Sol's. I gave this candidate Low impact and Low likelihood and then stated a candidate severity of `Informational`, while also asserting that no candidate severity in that review departed from the matrix. Low impact with Low likelihood is `Low` under TM-REV-001 section 9. The candidate severity above is therefore restated as Low, and the general form of the error is raised as AR-013, which applies to Sol's SR-014 and SR-019 records for the same reason.

One practical note on SR-019's recommendation, which is otherwise proportionate: `demo-link.yaml` declares `references: demo-item`, and `_validate_references` raises `DefinitionError` when a reference target is absent from the directory. The two demo definitions must therefore be excluded together, or definition loading fails closed at every entry point including `migrate` and API startup.

#### Evidence

- `backend/class-definitions/demo-item.yaml`, `demo-link.yaml` — present and unmarked; `demo-link` references `demo-item`.
- `backend/src/untangled/mapping/definition.py:84-108, 388-399` — every YAML in the directory is loaded and reference targets are required to exist.
- `backend/src/untangled/schema/migrate.py:72-81` — the plan reconciles to every loaded definition.
- `backend/src/untangled/seed/rbac_catalog.py:19-23, 118-139` — demo permissions minted and attached to the default read roles.
- `backend/src/untangled/auth/routes.py:39, 89-94` — the probe route, mounted unconditionally.
- Sol `security-review.md:1470-1540` — SR-019 in full.

#### Attack path or disconfirming path

1. Unchanged: anonymous OpenAPI retrieval reveals the probe and the demo namespace, signalling retained development defaults.
2. Disconfirming path re-examined and still rejected: no environment guard exists on the definitions directory, the seed catalogue, or the probe route.

#### Legitimate-user abuse case

None identified. Seeded `read-only` and `read-write` principals hold `demo-item` permissions they have no use for, which is a least-privilege deviation rather than an abuse path.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None; TM-REV-001 does not model the demo classes
- Current applicability: Not applicable

#### Requested resolution

Consolidation should carry SR-019 as substantiated, with severity recorded per AR-013 and with the recommendation noting that both demo definitions must be excluded together.

#### Final adversarial position

Resolved by evidence on substance. The severity label is corrected here and generalised in AR-013; the residual is the reference-coupling note on the recommendation.

### AR-012 — Access-token validation requires no `exp`, `iat`, issuer or audience claim

- Iteration disposition: Addressed
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

SR-001's claim and evidence now state that the decoder requires `sub` and `typ` but not `exp` or `iat`, that PyJWT validates `exp` only when present, and that no issuer or audience is validated; its recommendation adds a required-claim set and issuer or audience binding once multiple keys exist. SR-004 adds required and ceilinged timing claims. Section 15 records that a standalone required-claim finding was considered and folded in rather than duplicated.

#### Opus challenge

Addressed, and Sol's decision not to raise a separate finding is the right one: the forging capability is SR-001's precondition, so a separate record would double-count the same prerequisite. I re-verified `tokens.py:41` calls `jwt.decode` with an explicit `algorithms` list and no `options={"require": [...]}`, `issuer` or `audience` argument, and that `tokens.py:42-50` checks only `typ` and `sub`. The minted claim set is `sub`, `iat`, `exp`, `typ` — no `jti`, `iss` or `aud`.

One corroborating detail that bounds the forged-token reach and that neither report needs to change: `frontend/app/auth/config.server.ts:51-62` throws when the access token carries no numeric `exp`, because it derives the cookie `maxAge` from that claim. A no-`exp` forged token is therefore unusable through the SSR login path and works only against the API directly, which is where the attacker would use it anyway.

#### Evidence

- `backend/src/untangled/auth/tokens.py:23-50` — the minted claims and the decode call.
- `frontend/app/auth/config.server.ts:51-62` — the SSR requires a numeric `exp`.
- RFC 8725 section 3.9.
- Sol `security-review.md:186-234, 403-455` — the revised SR-001 and SR-004.

#### Attack path or disconfirming path

1. Unchanged: an attacker holding the signing secret mints `{"sub": "<admin uuid>", "typ": "access"}` with no `exp` and it validates indefinitely.
2. Disconfirming path unchanged: secret rotation invalidates it, and `get_current_user` re-reads the user row so deactivation remains effective.

#### Legitimate-user abuse case

None identified. No legitimate capability mints tokens.

#### Prior decision or acceptance

- Decision reference: ADR 002 deferred list; issue #67
- Recorded rationale: the JWT-versus-opaque-session question is genuinely open; the ES256 move is intent without a schedule
- Current applicability: Still supported — the gap should close regardless of how that question resolves, and becomes load-bearing under multiple keys

#### Requested resolution

Consolidation should carry the required-claim control inside SR-001 and SR-004 rather than as a separate finding.

#### Final adversarial position

Resolved by evidence. No residual uncertainty.

### AR-013 — `Informational` severity is recorded alongside matrix-producing impact and likelihood, and the derived counts do not follow from the records

- Iteration disposition: New
- Critique type: Rating
- Related Sol findings: SR-014, SR-019
- Related threats: THR-026, THR-016
- Related security requirements: None
- Candidate impact: Not applicable
- Candidate likelihood: Not applicable
- Candidate severity: Not applicable
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

Sol's rating method states that "Impact, likelihood, and overall priority use TM-REV-001 section 9. Severity equals the matrix result. No finding is elevated outside the matrix. `Informational` denotes a useful hardening or verification observation without a substantiated present exploit path." SR-014 then records Severity `Informational` with Impact `Medium` and Likelihood `Low`; SR-019 records Severity `Informational` with Impact `Low` and Likelihood `Low`. Section 16 reports `Low: 0`, `Informational: 2`, and `Uncertain: 5` covering SR-003, SR-006, SR-008, SR-011 and SR-012.

#### Opus challenge

Two of Sol's own rules collide in these two records, and the collision produces numbers consolidation cannot use.

Under TM-REV-001 section 9, Medium impact with Low likelihood is `Low`, and Low impact with Low likelihood is `Low`. So both records state impact and likelihood values whose matrix result is Low while labelling the severity `Informational`. Sol simultaneously asserts that severity equals the matrix result and that nothing is elevated outside it. Both statements cannot hold for these two rows.

The pipeline already resolves this. The consolidation template's finding record specifies `Impact: Critical / High / Medium / Low / Not applicable for Informational only` and `Likelihood: High / Medium / Low / Not applicable for Informational only`. `Informational` is a valid severity in this pipeline precisely because it sits outside the matrix, and the price of using it is that impact and likelihood must be recorded as `Not applicable` so no matrix result is implied. The minimal correction is therefore to set impact and likelihood to `Not applicable` on both records, not to change either severity: SR-014 explicitly claims "no authorization bypass is substantiated" and SR-019 explicitly claims "No present exploit is substantiated", which is the definition of `Informational` both templates give.

SR-019's likelihood line shows why the current form is confusing rather than merely untidy: "Shipping is deterministic under defaults, but security impact depends on another weakness." That is two different likelihoods in one sentence — the condition is certain, the harm is contingent — and `Not applicable` is the honest way to record it.

The consequence is arithmetic. Section 16 reports zero Low findings. A consolidator applying the matrix to Sol's own impact and likelihood inputs gets two. Whichever way the discrepancy is settled, the severity distribution that reaches human review changes, and the settlement should be a recorded decision rather than a transcription accident.

The same section under-reports uncertainty. `Uncertain: 5` omits SR-015, even though Sol's own unknowns table carries an SR-015 row — "Intended production DB role split and restore-point policy" — whose stated consequence is that it "Determines whether customers can avoid superuser-equivalent runtime", and SR-015's own disagreement note says "Customer production role design is unknown". That is material environment uncertainty on a High finding by Sol's own definition of the count. Consolidation's `Candidate — validation needed` bucket depends on this list.

I have to record that iteration 1 of this adversarial review committed the identical error: AR-011 carried Low impact, Low likelihood and a candidate severity of `Informational`, under a rating-basis paragraph asserting no departure from the matrix. That record is corrected above, and this critique states the general rule so consolidation applies one convention to both reports.

#### Evidence

- Sol `security-review.md:132-134` — the rating method asserting severity equals the matrix result with no elevation.
- Sol `security-review.md:1110-1112` — SR-014: Severity Informational, Impact Medium, Likelihood Low.
- Sol `security-review.md:1473-1475` — SR-019: Severity Informational, Impact Low, Likelihood Low.
- Sol `security-review.md:1522-1524` — SR-019's likelihood justification, which states a certain condition and a contingent harm.
- Sol `security-review.md:1723-1731` — the counts: `Low: 0`, `Informational: 2`, `Uncertain: 5`.
- Sol `security-review.md:1698` — the SR-015 unknowns row omitted from the uncertainty count.
- `architecture/security/threat-model.md:216-223` — the matrix: Medium/Low is Low and Low/Low is Low; elevation is permitted with a recorded reason, and no de-elevation rule exists.
- `.cursor/skills/architect/security/security-consolidation/findings.template.md:105-106` — `Not applicable for Informational only` for both impact and likelihood.
- Opus iteration 1 `adversarial-review.md:824, 177` — the same defect in this review's own iteration 1 record.

#### Attack path or disconfirming path

Not applicable; this concerns the accuracy of the reports' own rating vocabulary and derived counts rather than a system weakness.

#### Legitimate-user abuse case

Not applicable.

#### Prior decision or acceptance

- Decision reference: None
- Recorded rationale: None
- Current applicability: Not applicable

#### Requested resolution

Consolidation should set impact and likelihood to `Not applicable` for SR-014 and SR-019 and retain `Informational` severity, since both findings state that no present exploit path is substantiated; should recompute the severity distribution on that basis and record that `Low: 0` is a consequence of the convention rather than of the matrix; and should add SR-015 to the material-uncertainty set that feeds the `Candidate — validation needed` status. No further Sol or Opus pass is needed; this is a transcription convention the consolidator can apply directly.

#### Final adversarial position

The defect is certain and its resolution is mechanical. It carries no security severity of its own, but left uncorrected it hands human review a severity distribution and an uncertainty count that neither report's authoritative records support. My own iteration 1 record shared the defect and is corrected above.

### AR-014 — SR-014 treats the record surfaces as parallel; writes exist only on the deprecated surface

- Iteration disposition: New
- Critique type: Evidence
- Related Sol findings: SR-014, SR-016, SR-007
- Related threats: THR-026, THR-011
- Related security requirements: None
- Candidate impact: Not applicable
- Candidate likelihood: Not applicable
- Candidate severity: Not applicable
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

SR-014 is titled "Parallel legacy and v1 record surfaces create control-drift risk" and claims that "Both surfaces share current route authorization, so no authorization bypass is substantiated. They are not behaviorally identical: v1 enriches referenced records while legacy returns scalar IDs." Its recovery line is "remove legacy under issue #117", and its preconditions describe a future control "added to one branch only".

#### Opus challenge

The one behavioural difference SR-014 records is not the only one, and the one it omits is the more consequential for the drift argument it is making. In `records/router_factory.py`, `create_record` is defined inside `if surface == "legacy":` at lines 44-56, and `update_record` and `delete_record` are defined inside a second `if surface == "legacy":` at lines 177-215. The v1 surface builds only `/search` and `/{locator}`. The deprecated, unversioned surface is therefore the sole write surface for the entire platform, which the application's own OpenAPI description states as intent — "Create/update/delete remain unversioned until deliberately versioned."

Three consequences follow that SR-014 does not draw.

The drift asymmetry is not symmetric. SR-014's precondition imagines a control added to one branch and clients migrating to the less restrictive one. For reads that is right. For writes there is no second branch: a future row, attribute, or reference authorization rule has exactly one place to live, and it is the surface issue #117 exists to delete. ASM-025 names "write validation" explicitly as one of the surfaces across which lack of access must be indistinguishable from non-existence, so this is not a hypothetical requirement — it is stated accepted direction with nowhere stable to be implemented.

The stated recovery is unavailable. "Remove legacy under issue #117" would remove create, update and delete from the product. The removal has a hard prerequisite — versioning the write routes first — that is recorded nowhere: not in SR-014, not in its recommendation, and, per SR-014's own evidence line, not as a sunset condition on the issue. AGENTS.md section 3.9 requires that migration and deprecation conditions be stated rather than left in code comments or memory, and this is precisely such a condition.

SR-016's remediation inherits the problem. Sol's recommendation for SR-016 is to check referenced-class authority before enriching and to return a non-existence representation instead. Enrichment exists only on v1; write validation of FK values exists only on legacy. A consistent reference-visibility semantic has to span both surfaces, which the finding set does not currently say.

I am not challenging SR-014's Informational severity or its Low likelihood, both of which follow from the shared factory and the identical `require_class_operation` dependency, which I re-verified. I am challenging the accuracy of "parallel" and of the recovery line, because a remediation designer reading SR-014 as written would look for the write path on v1 and not find it.

#### Evidence

- `backend/src/untangled/records/router_factory.py:44-56` — `create_record` defined only when `surface == "legacy"`.
- `backend/src/untangled/records/router_factory.py:177-215` — `update_record` and `delete_record` defined only when `surface == "legacy"`.
- `backend/src/untangled/records/router_factory.py:57-175` — search and fetch built for both surfaces, with `enrich = surface == "v1"`.
- `backend/src/untangled/main.py:20-34` — both surfaces mounted; the application description states create, update and delete remain unversioned.
- `architecture/security/threat-model.md` ASM-025 — indistinguishability required "consistently across every surface — search, fetch, write validation, and anything else that describes or returns a class".
- `AGENTS.md` section 3.9 — deprecation and migration conditions must be recorded as linked follow-up, not in comments or memory.
- Sol `security-review.md:1127-1136, 1152` — the parity claim, the evidence line, and the recovery line.

#### Attack path or disconfirming path

No present attack path; both surfaces apply the same class-permission dependency and I confirmed the check is identical. The disconfirming path for the drift concern is the one SR-014 already names: define the removal conditions and run an identical security matrix across both surfaces. This critique adds that the matrix has to include the write operations, which exist on only one of them.

#### Legitimate-user abuse case

None identified today. It becomes relevant when write-side row or attribute authorization is designed, at which point the only available implementation point is the deprecated surface.

#### Prior decision or acceptance

- Decision reference: Issue #117; AGENTS.md section 3.9
- Recorded rationale: removal of the legacy read surface is tracked; the OpenAPI description records that writes stay unversioned deliberately
- Current applicability: Conditions changed — the deferral remains reasonable, but its removal condition is now identifiable and should be recorded rather than left implicit. Sol already flags the missing condition; this names it

#### Requested resolution

Consolidation should correct SR-014's parity characterisation to state that create, update and delete exist only on the legacy surface, should record "write routes versioned" as the concrete removal precondition for issue #117 under the AGENTS.md section 3.9 convention, and should note under SR-016 and SR-007 that any future write-side reference or attribute rule currently has only one implementation point. No severity change is requested.

#### Final adversarial position

The facts are certain from the code. The consequence is a correction to SR-014's description and to the removal condition attached to issue #117, not a new weakness or a rating change. Human judgment is needed only on the removal condition itself.

### AR-015 — Authorized API record deletion destroys the row and its attribution together, with no durable event

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-009, SR-007, SR-011
- Related threats: THR-017, THR-015, THR-020
- Related security requirements: None
- Candidate impact: High
- Candidate likelihood: Low
- Candidate severity: Medium
- Rating elevation: None
- Confidence: High
- Human review required: Yes

#### Sol position

SR-009 claims that "Database access bypasses RBAC and application audit… audit stamps are mutable latest-writer fields" and that "No durable security audit, read/auth/permission events, tamper evidence, SIEM export, or separate roles exist". Its preconditions are "An operator, leaked log reader, host compromise, or API compromise obtains database authority", and its likelihood justification is that "Infrastructure authority is a meaningful prerequisite but routine for operators and a natural host-compromise pivot". SR-007 covers unrecorded reads. SR-011 covers destructive schema helpers with no HTTP caller. Sol's threat-coverage table maps THR-017 to SR-007, SR-009 and SR-017.

#### Opus challenge

No finding addresses irreversible destruction of record data through the ordinary, authenticated, mounted HTTP route, and the accountability finding that owns the territory reasons exclusively about database-level access.

`persistence/store.py:181-190` implements deletion as `DELETE FROM {table} WHERE id = {}`. There is no soft-delete column, no tombstone table, no archive, and no event emission anywhere in the module. The record's `created_by`, `updated_by`, `created_at` and `updated_at` columns are attributes of the row being removed, so the deletion removes the data and the only evidence of who ever touched it in the same statement. `records/router_factory.py:199-215` exposes this as `DELETE /{locator}` behind `require_class_operation(class_kebab, "delete")` and returns 204.

This is not within SR-009's demonstrated reach. SR-009's preconditions and likelihood justification both require database or infrastructure authority; the delete route requires only an ordinary API permission and no infrastructure access at all. It is not within SR-007's reach either, which is about reads that leave no trace, not writes that remove traces. And it is not SR-011, whose Low likelihood rests explicitly on "no HTTP caller keeps likelihood Low" — the observation that makes SR-011 mild is exactly what does not hold here.

The consequence is stronger than the general audit gap THR-017 describes. THR-017 says an attacker who alters content "leaves only a timestamp and a name — and can overwrite that with a subsequent legitimate-looking edit". Deletion leaves neither. After a delete, the product cannot establish that the record existed, what it contained, who created it, or who removed it. Recovery depends entirely on customer backups, which ASM-003 places outside the product and which SR-009 itself lists as "Recovery: customer backups, outside product scope". For a platform whose audit requirement is stated as enterprise and government grade (ASM-015), unreconstructable authorized destruction is the strongest case of the requirement being unmet, and it is currently the only one with no product-side artefact whatsoever.

I rate likelihood Low deliberately, and the reason is a control I verified rather than an assumption. `_role_permission_keys` grants no `:delete` key to any seeded role: `read-only` gets read, `read-write` and `change-request-read-write` get create, read and update, `incident-read-only` gets `incident:read`, and only `admin` receives the allow-all key. There is no role-management API, so delegating delete to a non-admin role requires direct database work. Today the route is therefore reachable only by a principal holding `admin`, or by an attacker who has forged or stolen one — which is SR-001's and SR-003's outcome, making this the natural second step of Sol's own "Forged durable administrator" chain rather than an independent entry point.

Impact is High on the accepted definitions: irreversible loss of operational record content (AST-004) together with its audit trail (AST-009), with no product recovery path, is "material integrity loss" at minimum and is unrecoverable from the product's own perspective. High impact with Low likelihood is Medium under the matrix, which is the same rating Sol gives SR-011 for the analogous schema-level destruction — a consistency I take as corroborating rather than coincidental.

The minimal control is not a redesign of audit. It is a durable, exportable deletion event carrying actor, class, locator and timestamp, emitted before the row is removed; whether deletion should additionally become soft is a product decision, not a security minimum.

#### Evidence

- `backend/src/untangled/persistence/store.py:181-190` — `DELETE FROM {} WHERE id = {}`; no soft-delete, tombstone, or event.
- `backend/src/untangled/records/router_factory.py:199-215` — `DELETE /{locator}` gated on `require_class_operation(class_kebab, "delete")`, returning 204.
- `backend/src/untangled/mapping/system_fields.py` — the audit fields are columns on the record row, so they are removed with it.
- `backend/src/untangled/seed/rbac_catalog.py:118-139` — no seeded role holds any `:delete` key; only `admin` holds the allow-all key.
- `backend/src/untangled/rbac/keys.py:41-45` — `admin` is allow-all, so it satisfies the delete dependency.
- `architecture/security/threat-model.md` THR-017 — the audit gap is described in terms of altered content leaving "only a timestamp and a name", not of removal leaving nothing.
- `architecture/security/threat-model.md` ASM-015 — durable, tamper-evident, SIEM-exportable audit is a stated requirement.
- Sol `security-review.md:768-819` — SR-009's claim, preconditions and likelihood justification, all database-authority based.
- Sol `security-review.md:939` — SR-011's Low likelihood resting on the absence of an HTTP caller.

#### Attack path or disconfirming path

1. An attacker obtains `admin` authority — by the SR-001 forged-token path, the SR-002 default-credential path, or SR-003 credential stuffing against the published admin username.
2. For each target record, issue `DELETE /incidents/{locator}` or `DELETE /change-requests/{locator}`. Each returns 204 and removes the row.
3. Nothing in the product records that the records existed or that they were removed. An investigator has no product-side artefact to work from, and `created_by` and `updated_by` for those records no longer exist.
4. Disconfirming path examined and rejected: I searched for a soft-delete flag, a tombstone or archive table, a deletion event, and any logging facility in the record store and the router factory, and found none. The `schema_version` table records DDL history only. FastAPI's access log, if the customer collects stdout, would show the request line but is not a product control and carries no record content.
5. Partially disconfirming and recorded as such: the seeded catalogue grants no delete permission to any non-admin role, and there is no API to grant one. That is what holds likelihood at Low rather than higher, and it is a real bound, not a formality.

#### Legitimate-user abuse case

This is primarily a legitimate-capability case. An `admin` holder deleting records is performing an ordinary, sanctioned housekeeping action; the platform cannot distinguish it from evidence destruction, and records neither. ACT-013's expectation in the accepted model is that "Actions are bounded, recorded, and non-repudiable" — for deletion, none of the three holds. ACT-004's expectation is that administrator actions are "strongly audited"; for deletion there is no audit at all.

#### Prior decision or acceptance

- Decision reference: None. TM-REV-001 does not model record deletion specifically; THR-017 covers audit generally and THR-020 covers schema-level destruction
- Recorded rationale: None
- Current applicability: Not applicable — no prior decision considered this path

#### Requested resolution

Consolidation should carry this as a missed-finding candidate at Medium, either as its own record or as an explicitly evidenced branch of SR-009 with its own likelihood justification, because SR-009's current Medium likelihood reasoning about infrastructure authority does not describe it. Human review should decide whether a durable deletion event is required before production and whether record deletion should additionally be soft. The reason human review is needed rather than a further review pass is that the answer is a product-design decision, not a missing piece of evidence.

#### Final adversarial position

The mechanism is certain from the code and the coverage gap is real: no finding in either iteration evidences unrecorded authorized destruction through the API. The rating is Medium and I hold it there on the strength of the seeded-permission bound, which I verified rather than assumed. The residual uncertainty is whether a customer would in practice grant delete more widely by direct database work, which no repository evidence can settle.

### AR-016 — The shipped `requested-by` create-default names the seeded administrator, which is also the stub actor identity

- Iteration disposition: New
- Critique type: Missed finding
- Related Sol findings: SR-009
- Related threats: THR-015, THR-017
- Related security requirements: None
- Candidate impact: Medium
- Candidate likelihood: Low
- Candidate severity: Low
- Rating elevation: None
- Confidence: High
- Human review required: No

#### Sol position

SR-009 records the stub-actor collision as "`persistence/actor.py` and `seed/users.py:11-12` collide system/admin UUIDs; `schema/migrate.py:105-115` invokes the stub path", which is the non-HTTP write channel. No finding in either iteration examines the shipped class definitions for attribution defaults, and neither report mentions `requested-by`.

#### Opus challenge

The collision has already leaked out of the non-HTTP channel and into a user-facing accountability field, through a value the product ships.

`change-request.yaml` declares `requested-by` as a required `uuid` referencing `user`, with `create-default: "01900000-0000-7000-8000-000000000001"`. That UUID is `SEED_ADMIN_ID`, and `persistence/actor.py` sets `STUB_ACTOR_ID` to the same value — the collision THR-015 rates Medium and Medium. The definition's own comment names the debt: "M1 scoped debt: baseline seed-catalog admin UUID (SEED_ADMIN_ID / STUB_ACTOR_ID). Valid only when the intentional baseline seed is applied… do not copy this pattern to other actor-typed attributes."

The security-relevant consequence is not that a user-editable field can hold a chosen value; in ITSM, filing a change on someone else's behalf is correct behaviour. It is that the platform's shipped default answer to "who requested this change" is the administrator account, and that this is the one account whose attribution the accepted model already says cannot be relied on. A change request bearing `requested_by = <admin uuid>` is indistinguishable between three cases: the administrator genuinely requested it, a batch or migration process created it, and nobody filled the field in and the default stood. That is THR-015's exact defect, reproduced in a domain field that operators read as an accountability statement rather than in an audit column they may not look at.

`create_default` is already published to the web tier: `frontend/app/generated/field_meta.ts:50` carries the admin UUID as `requested-by`'s `create_default`, so the value is shipped, not merely declared.

Two facts bound this and I record them as the reason for the Low rating rather than burying them. First, no create surface consumes the default yet: `frontend/app/routes/destination_new.tsx` renders `DestinationPlaceholder`, and a repository search finds no consumer of `create_default` in the web tier outside the generated metadata itself. The automatic path is built but not yet wired. Second, the audit column `created_by` still records the acting principal correctly, and the generated write models exclude system fields, so the falsification is confined to the domain field. Deliberate misattribution therefore requires an insider with `change-request:create` — which the seeded `read-write` and `change-request-read-write` roles both hold — choosing to set the field to another user.

I rate impact Medium by explicit parity with the accepted model's own calibration of THR-015, which is the same defect on the same account with the same "underlying data is still correct" bound, rather than by independent assertion. Likelihood is Low because the automatic path is not yet reachable and the deliberate path needs an insider decision. Medium impact with Low likelihood is Low under the matrix.

#### Evidence

- `backend/class-definitions/change-request.yaml` — `requested-by`: `type: uuid`, `required: true`, `references: user`, `create-default: "01900000-0000-7000-8000-000000000001"`, with the scoped-debt comment.
- `backend/src/untangled/seed/rbac_catalog.py:9-15` and `seed/users.py:11-12` — `SEED_ADMIN_ID` is that UUID; `persistence/actor.py` sets `STUB_ACTOR_ID` to the same value.
- `frontend/app/generated/field_meta.ts:50` — the create-default is shipped to the web tier.
- `frontend/app/routes/destination_new.tsx:39-43` — the new-record route renders a placeholder; no create form consumes the default yet.
- `backend/src/untangled/mapping/definition.py:218-223, 419-465` — `create-default` is validated as a UI form default, documented in `AttributeDefinition` as "Create-form UX default… not a DB column DEFAULT".
- `backend/src/untangled/seed/rbac_catalog.py:126-136` — `read-write` and `change-request-read-write` both hold `change-request:create`.
- `architecture/security/threat-model.md` THR-015 — Medium impact, Medium likelihood, "Bounded because the underlying data is still correct".

#### Attack path or disconfirming path

1. An insider holding `change-request:create` posts a change request with `requested_by` set to the seeded administrator's UUID.
2. The record now states that the administrator requested the change. `created_by` correctly names the insider, but the domain field an operator reads as accountability names the administrator, and that UUID is also the stub actor, so the field cannot be disambiguated even in principle.
3. The forward path, once a create form lands: the shipped default writes the same value with no user action at all, at which point the ambiguity becomes the normal case rather than a deliberate one.
4. Disconfirming path examined and partially confirmed: no create form exists today, and `created_by` remains correct. Those two facts are why this is Low and not Medium.

#### Legitimate-user abuse case

This is the abuse case. Filing a change request on another person's behalf is legitimate product behaviour, so no control can distinguish it from misattribution. The specific problem is that the default target is the administrator and the stub actor at once.

#### Prior decision or acceptance

- Decision reference: None as a security decision; the YAML comment records it as M1 scoped debt with a named follow-on
- Recorded rationale: foreign-key safety under the baseline seed, with an explicit instruction not to copy the pattern
- Current applicability: Rationale undocumented as a security matter — the engineering motive is recorded, its accountability cost is not, which is the same shape TM-REV-001 records for THR-015

#### Requested resolution

Consolidation should carry this as a missed-finding candidate at Low, linked to THR-015 rather than treated as new territory, and should record that the follow-on the YAML comment anticipates should substitute the current user or an explicit picker rather than a constant. It should also record the general form: shipped class definitions can carry attribution defaults, and no finding in either iteration examines them.

#### Final adversarial position

The facts are certain and the bound is real; this is deliberately rated Low and is forward-weighted, becoming materially more likely the moment a create form consumes the shipped default. It is recorded because it shows THR-015's collision is no longer confined to non-HTTP writes, which is a claim neither report makes.

## 8. Sol finding audit

| Sol finding | Evidence verified | Attack path | Rating | Provenance | Recommendation | Opus result | Related critiques |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SR-001 | Verified | Supported | Supported | Not applicable (full review) | Proportionate | Supported — claim-set correction verified | AR-012 |
| SR-002 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — widened impact reasoning verified | AR-001, AR-003 |
| SR-003 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — mechanism and control ordering now complete | AR-004 |
| SR-004 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | AR-012 |
| SR-005 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — revised Medium is the correct matrix result | AR-007 |
| SR-006 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — narrowing correctly withdrawn; API tier added | AR-006 |
| SR-007 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | AR-002, AR-005, AR-014 |
| SR-008 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — multiplier independently re-derived as a ceiling | AR-005 |
| SR-009 | Verified | Supported | Supported | Not applicable | Under-engineered | Supported for direct-database authority; does not reach authorized API deletion | AR-001, AR-003, AR-015, AR-016 |
| SR-010 | Verified | Supported | Supported | Not applicable | Proportionate | Supported | AR-011 |
| SR-011 | Verified | Supported | Supported | Not applicable | Proportionate | Supported; THR-027 link correctly removed | AR-008, AR-015 |
| SR-012 | Verified | Supported | Supported | Not applicable | Proportionate | Supported; THR-019 link correctly removed | AR-008, AR-009 |
| SR-013 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — independently confirmed no `SECURITY.md` or disclosure channel | None |
| SR-014 | Verified | Supported | Challenged | Not applicable | Proportionate | Revise — parity description incomplete; severity recording inconsistent with the matrix | AR-013, AR-014 |
| SR-015 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — restore-point unconditionality and Compose bootstrap role independently confirmed | AR-001 |
| SR-016 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — Low impact independently corroborated by the FK target inventory | AR-002, AR-014 |
| SR-017 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — all three print sites confirmed | AR-003 |
| SR-018 | Verified | Supported | Supported | Not applicable | Proportionate | Supported — accepted trade preserved as ADR 002 requires | AR-009 |
| SR-019 | Verified | Supported | Challenged | Not applicable | Proportionate — with one implementability caveat: `demo-link` references `demo-item`, so both must be excluded together or definition loading fails closed | Supported on substance; severity recording inconsistent with the matrix | AR-011, AR-013 |

### Meaningful no-finding claims

| Sol claim or threat | Evidence independently checked | Opus result | Related critiques or residual uncertainty |
| --- | --- | --- | --- |
| Present stored XSS not substantiated (THR-010) | Re-confirmed no `dangerouslySetInnerHTML`, `innerHTML`, `srcDoc`, `eval` or `new Function` in the frontend, and that every `href` sink is static or built through `record_detail_path`, which percent-encodes the locator behind an allowlisted collection | Supported | Withdrawal remains correct. Residual: holds only until a rich-text or Markdown surface is introduced, as THR-010 states |
| SQL injection in predicate search withdrawn | Re-read the compiler. Attribute names resolve through the class definition and injected system fields; identifiers are composed via `sql.Identifier`; values are placeholders; `_escape_like_literal` neutralises LIKE metacharacters; the sole literal is a fixed escape character | Supported | Correct. The same code remains the subject of SR-008 on resource grounds |
| SSRF through the absolute-URL fetch helper not presently reachable | Re-confirmed `api_fetch_with_token` accepts absolute URLs at `api.server.ts:70-72`, and that the only production caller validates the collection against a two-entry allowlist before any request is constructed | Supported | Correct, and Sol's defence-in-depth cleanup suggestion is sound. Residual: the validation lives in the caller, not in the helper |
| Current legacy/v1 authorization bypass not substantiated (THR-026) | Confirmed both surfaces are produced by `build_class_router` and apply an identical `require_class_operation` dependency on search and fetch | Supported for route authorization | Incomplete as a parity statement: writes exist only on legacy — see AR-014 |
| Authenticated cache control confirmed — withdrawn | Confirmed no route exports `headers`, and that the sole supporting test asserts a loader object | Supported | The withdrawal is correct and is the honest disposition |
| Standalone JWT required-claim finding not separately raised | Confirmed the forging capability is SR-001's precondition, so a separate record would double-count the prerequisite | Supported | Correct judgement. Corroborating detail: the SSR requires a numeric `exp`, so a no-`exp` forgery works only against the API directly |
| Separate login body/pool and search amplification findings folded into SR-003 and SR-008 | Confirmed both concern the same reachable path and the same absent controls as the parent findings | Supported | Correct; folding avoids double-counting the same control gap |
| Current customization, tier, promotion or recovery exploit — coverage gaps not findings | Confirmed no customization runtime, host process, service identity, promotion engine, tier marking, or recovery channel exists anywhere in the repository | Supported | Correct, and now consistently recorded in the coverage table |
| THR-024 has a finding rather than a bare coverage note | Confirmed the concentration facts and the refresh-token discard | Supported | AR-009 resolved |
| Not claimed by Sol — configuration-to-DDL and configuration-to-code injection | Examined `mapping/definition.py`, `naming.py`, `emit_pydantic.py`, `sql_types.py` and `schema/ddl.py`. Names are constrained to alphanumeric kebab segments, types resolve through a closed map, identifiers are composed not interpolated, and docstrings escape backslashes and triple quotes | Supported as a no-finding area | Recorded so consolidation knows the TB-009 code path was examined. A hostile definition can break a build; no injection path was found |
| Not claimed by Sol — unhandled-exception disclosure | `main.py` registers only the validation handler; unexpected exceptions therefore return Starlette's default 500 with no body detail and no stack trace | Supported as a no-finding area | Residual: tracebacks reach stdout, which is a customer log-handling matter, and SR-010 already covers the validation-echo path |

## 9. Iteration critique ledger

| Critique ID | Iteration 1 concern | Sol iteration 2 response | Final disposition | Final justification |
| --- | --- | --- | --- | --- |
| AR-001 | Shared database role is superuser-equivalent by product requirement; database access escalates to host command execution | Created SR-015 at High; revised SR-002 impact and SR-009 recommendation feasibility | Addressed | Independently re-verified: the restore point is unconditional for non-empty plans, its docstring records the privilege requirement, and Compose provisions the bootstrap superuser. Sol's "database container" phrasing is more precise than iteration 1's |
| AR-002 | FK enrichment discloses referenced-class content with no referenced-class permission check | Created SR-016 at Medium; narrowed SR-014's parity claim to authorization dependencies | Addressed | The requested target inventory was performed independently: every enrichment-reachable class is `user`, whose display attribute is `display-name` with no friendly-id, which corroborates Low impact |
| AR-003 | Operator CLIs print the database password and effective seed passwords | Created SR-017 at Medium; corrected SR-002's evidence line | Addressed | All three print sites re-verified, including that `password_for` returns the environment override |
| AR-004 | Unbounded login body and password length against a shared bounded worker pool | Revised SR-003's claim, evidence, likelihood and recommendation ordering | Addressed | The dummy-hash interaction is explicitly recorded and the controls are correctly sequenced. Sol's likelihood raise to High is defensible and does not change the matrix result |
| AR-005 | Search guardrails amplify rather than bound; COUNT doubles the work; offset is unbounded | Revised SR-008 to High likelihood with the multiplier, COUNT duplication, offset and sort-key gaps and an extended recommendation | Addressed | The ~2,500-leaf figure was re-derived from the depth entry point, the depth guard and the child limit; it is a hard ceiling |
| AR-006 | SR-006 narrows an accepted threat-model claim on unverified evidence and omits the API tier | Withdrew the narrowing in both the summary and SR-006; added the API tier; recorded the withdrawal in section 15 | Addressed | Sol declined to claim evidence it does not hold, which is the correct resolution. The substantive header question remains open for security design |
| AR-007 | SR-005 merges two weaknesses of different likelihood and rates both at the lower | Raised SR-005 to Medium, split the likelihood justification, and led with the loader path | Addressed | The merged record now names the half that drives the rating, which is what consolidation needs |
| AR-008 | Finding and coverage tables disagree about which forward-looking threats were analysed | Removed the THR-027 and THR-019 links; coverage table now lists all four unbuilt threats as insufficient evidence | Addressed | Both named instances are fixed. Cosmetic residual: SR-018's summary row lists THR-028 unqualified while the coverage row qualifies it correctly |
| AR-009 | THR-024 concentration has no finding of its own | Created SR-018 at Medium, preserving the ADR 002 trade | Addressed | Every concentration fact re-verified, including the refresh-token discard Sol credits |
| AR-010 | Prior accepted-risk table asserts a tolerance rationale that does not exist | Removed the SR-001 to SR-013 row; section 11 now contains only the four real prior decisions and states the correction | Addressed | Thirteen spurious human-review entries are gone. The SR-015 row's `Rationale undocumented` verdict is used correctly |
| AR-011 | Demo classes, demo permissions and the RBAC probe ship in production | Created SR-019 as a separate Informational record and stated that a production migration plans the demo tables | Addressed | Substance confirmed. Two corrections belong to this review, not Sol: the iteration 1 candidate severity is restated as Low per AR-013, and the recommendation needs both demo definitions removed together because `demo-link` references `demo-item` |
| AR-012 | Token validation requires no `exp`, `iat`, issuer or audience | Corrected SR-001's claim and evidence; folded required claims into SR-001 and SR-004; recorded the folding decision in section 15 | Addressed | Not raising a separate finding is the right call, since the forging capability is SR-001's precondition |
| AR-013 | Not applicable — raised at iteration 2 | Not applicable | New | `Informational` severity is recorded with matrix-producing impact and likelihood on SR-014 and SR-019, and the derived counts report zero Low findings and omit SR-015 from the uncertainty set. The consolidation template resolves the vocabulary; this review's own iteration 1 shared the defect |
| AR-014 | Not applicable — raised at iteration 2 | Not applicable | New | Create, update and delete are built only for the legacy surface, so SR-014's parity description and its stated recovery of removing legacy are both incomplete, and future write-side authorization has one implementation point |
| AR-015 | Not applicable — raised at iteration 2 | Not applicable | New | Record deletion is a hard `DELETE` that removes the row and its audit columns together with no event; SR-009 owns the accountability claim but reasons only about database authority, and SR-011's mitigating "no HTTP caller" does not apply |
| AR-016 | Not applicable — raised at iteration 2 | Not applicable | New | `change-request.requested-by` ships a create-default equal to `SEED_ADMIN_ID`, which is also `STUB_ACTOR_ID`, extending THR-015's ambiguity into a domain accountability field |

## 10. Missed-finding candidates

| Critique ID | Candidate weakness | Evidence | Candidate severity | Related threats | Next treatment |
| --- | --- | --- | --- | --- | --- |
| AR-015 | Authorized record deletion through the mounted API is a hard `DELETE` that removes the record and its `created_by`, `updated_by` and timestamps in one statement, with no soft delete, tombstone, or durable event; recovery depends wholly on customer backups | `persistence/store.py:181-190`; `records/router_factory.py:199-215`; `mapping/system_fields.py`; `seed/rbac_catalog.py:118-139` (no seeded role holds a delete key; `admin` is allow-all); THR-017; ASM-015 | Medium (High impact, Low likelihood) | THR-017, THR-015, THR-020 | Consolidation, then human review of whether a durable deletion event is required before production and whether deletion should be soft |
| AR-016 | The shipped `change-request.requested-by` create-default is `SEED_ADMIN_ID`, which is also `STUB_ACTOR_ID`, so the product's default answer to who requested a change is the account whose attribution THR-015 already says cannot be relied on; the value is already published to the web tier as generated field metadata | `backend/class-definitions/change-request.yaml`; `seed/users.py:11-12`; `persistence/actor.py`; `frontend/app/generated/field_meta.ts:50`; `frontend/app/routes/destination_new.tsx:39-43` (no consumer yet); THR-015 | Low (Medium impact, Low likelihood) | THR-015, THR-017 | Consolidation, linked to THR-015; no human ruling required beyond the follow-on the YAML comment already anticipates |

## 11. Prior accepted-risk reassessment

| Finding or critique | Prior decision or rationale | Current evidence and security practice | Opus reassessment | Human review needed |
| --- | --- | --- | --- | --- |
| SR-001 to SR-013, SR-015 to SR-017, SR-019 / AR-010 | TM-REV-001 section 15 records that no individual risk was accepted; acceptance of the revision was acceptance of its description of the landscape | Re-confirmed by reading the accepted threat model at the pinned commit. Sol iteration 2 now states this correctly in both prose and table and asserts no tolerance verdict | Not applicable — there is no prior acceptance to reassess, and Sol no longer implies one | No |
| SR-014 / legacy record surface | Removal tracked as issue #117 under the AGENTS.md section 3.9 convention; THR-026 rates the duplication Low because the shared factory prevents present divergence | The shared factory and the identical class-permission dependency are verified. The surfaces already differ in projection content, and they also differ in operations: create, update and delete exist only on legacy | Conditions changed — the deferral remains reasonable, but the Low rating's parity premise now has two exceptions, and the removal condition is identifiable and unrecorded (AR-014) | Yes |
| SR-015 / restore-point privilege | Documented in `schema/versions.py` and `docs/class-definitions.md` as an operational caveat, not as a security decision | Verified: the call is unconditional for non-empty plans and precedes all DDL; Compose provisions the bootstrap superuser; runtime and CLIs share one credential | Rationale undocumented — the operational caveat is recorded and its security consequence has never been assessed. Sol's row states this correctly | Yes |
| SR-016 / ASM-024 identifiers provisionally non-sensitive | Human-confirmed but explicitly provisional, with FK view inheritance named as a candidate refinement | The implemented v1 surface returns referenced-record display content, not identifiers. My independent inventory bounds that content to `user.display_name` today | Conditions changed — the candidate refinement is a present gap, and its severity is likelihood-driven rather than impact-driven. Sol's row states this correctly | Yes |
| SR-018 / ADR 002 THR-024 web-tier concentration | Recorded as the accepted cost of ADR 002, "so the concentration is visible rather than to reopen the decision" | Verified: the SSR process holds the cookie secret, sees every token, handles plaintext credentials, and runs as root; the refresh-token discard genuinely limits persistence | Still supported as a deliberate trade. The acceptance's visibility condition is now met by SR-018 rather than defeated by placement inside a dependency finding | Yes |
| AR-016 / `requested-by` create-default | The YAML comment records the value as M1 scoped debt chosen for foreign-key safety under the baseline seed, with an instruction not to copy the pattern | The value is `SEED_ADMIN_ID` and `STUB_ACTOR_ID`, and is already shipped to the web tier as generated metadata; no create form consumes it yet | Rationale undocumented as a security matter — the engineering motive is recorded, the accountability cost is not, which is the same shape TM-REV-001 records for THR-015 | No |
| ASM-007 / fail-closed secret handling | Human-confirmed intent; TM-REV-001 already notes the API does not implement it | Verified again: the web tier refuses both required values and throws on an unrecognised cookie-secure setting; the API defaults its signing secret and database credentials | Rationale unsupported for the API tier — the assumption states a posture the implementation contradicts, which SR-001, SR-002 and SR-006 correctly find against | No |

## 12. Threat and coverage gaps

| Threat ID or surface | Sol treatment | Opus assessment | Related critiques | Remaining evidence needed |
| --- | --- | --- | --- | --- |
| THR-001 | Finding SR-001 | Adequate | AR-012 | None |
| THR-002 | Findings SR-002, SR-015, SR-017 | Adequate — the privilege escalation and the credential-logging channel are both now recorded | AR-001, AR-003 | Customer production role design, outside repository evidence |
| THR-003 | Finding SR-003 | Adequate | AR-004 | None |
| THR-004 | Finding SR-003 | Adequate — the shared worker pool and the absent body and password bounds are recorded | AR-004 | Threadpool sizing and measured Argon2 cost under concurrency |
| THR-005 | Finding SR-003 | Adequate | AR-004 | Network-level timing measurement, as both reports state |
| THR-006 | Findings SR-001, SR-004 | Adequate | AR-012 | None |
| THR-007 | Finding SR-004 | Adequate — rotation atomicity and the SHA-256 digest storage independently re-verified | None | None |
| THR-008 | Finding SR-005 | Adequate | AR-007 | None |
| THR-009 | Finding SR-006 | Adequate — the narrowing is withdrawn and the API tier is included | AR-006 | Captured document response headers from a built server |
| THR-010 | No issue substantiated | Adequate — independently re-tested across all HTML and URL sinks | None | Re-review when rich text or custom rendering is introduced |
| THR-011 | Findings SR-007, SR-016 | Adequate for reads | AR-002, AR-014 | Referenced-class inventory at the point attribute-level authorization is designed |
| THR-012 | Findings SR-007, SR-016 | Adequate | AR-002, AR-005 | None |
| THR-013 | Finding SR-008 | Adequate — multiplier, COUNT duplication, offset and sort-key count all recorded | AR-005 | Load measurement, as both reports state |
| THR-014 | Findings SR-009, SR-015, SR-017 | Adequate | AR-001, AR-003 | Same as THR-002 |
| THR-015 | Finding SR-009 | Incomplete — the collision is verified for the non-HTTP write path, but its appearance as a shipped domain-field default is unrecorded | AR-016 | None; the mechanism is fully established |
| THR-016 | Findings SR-010, SR-019 | Adequate — demo scaffolding is separated and the validation echo is recorded | AR-011, AR-013 | None |
| THR-017 | Findings SR-007, SR-009, SR-017 | Incomplete — unrecorded reads and privileged direct SQL are covered; unrecorded authorized destruction through the API is not | AR-015 | None; the mechanism is fully established |
| THR-018 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded | AR-008 | Promotion engine design (U6, U7) |
| THR-019 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded after the SR-012 link was removed | AR-008 | Sandbox isolation design (U1) |
| THR-020 | Findings SR-011, SR-015 | Adequate for schema destruction and restore-point privilege; the analogous data-level destruction path is unrecorded | AR-015 | None |
| THR-021 | Findings SR-012, SR-015 | Adequate | AR-001 | Advisory and provenance scan, as both reports state |
| THR-022 | Finding SR-013 | Adequate — independently re-confirmed no `SECURITY.md` and no disclosure channel | None | None |
| THR-023 | Finding SR-006 | Adequate | AR-006 | Production transport topology, out of scope |
| THR-024 | Findings SR-012, SR-018 | Adequate — the concentration now has its own record | AR-009 | None |
| THR-025 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded | None | Recovery flow design |
| THR-026 | Findings SR-014, SR-016 | Incomplete — route-authorization parity is verified, but the write-operation asymmetry is unrecorded | AR-014 | None |
| THR-027 | Insufficient evidence, no finding | Out of scope for code analysis — correctly recorded after the SR-011 link was removed | AR-008 | Tier mechanism design (issue #116) |
| THR-028 | Insufficient evidence, SR-018 as decision input | Adequate as recorded in the coverage table; the finding summary row lists THR-028 without the qualifier | AR-008, AR-009 | Host decision (U1) |
| Surface: record delete route | Not examined by either report | Missing | AR-015 | None; the mechanism is fully established |
| Surface: shipped class-definition attribution defaults | Not examined by either report | Missing | AR-016 | None; the mechanism is fully established |
| Surface: configuration-to-DDL and configuration-to-code generation | Not examined by either report | Adequate — examined by this review and no injection path found | None | Re-review when configuration-authored definitions from an external repository become loadable |
| Surface: unauthenticated `/auth/refresh` and `/auth/logout` | Not separately examined | Adequate — both act only on an opaque token resolved through a SHA-256 digest lookup, so neither is guessable; `rotate_refresh_token` fails closed for inactive users | None | None |

## 13. Diff-aware assessment

Not applicable — full-review mode. No base ref, target ref, diff hash or supplied diff was provided, and the manifest records the run as a full review of a pinned snapshot. Sol's decision not to assign change provenance, and its recording of `Not applicable` in every provenance field, are both correct.

### Provenance corrections

| Finding or critique | Sol classification | Opus classification | Evidence |
| --- | --- | --- | --- |
| Not applicable | Not applicable | Not applicable | Full-review mode; no provenance was assigned or required, and none was incorrectly asserted |

### Introduced risks or regressions Sol missed

- None identified — not applicable in full-review mode.

### Pre-existing weaknesses that remain relevant

- Not applicable as a provenance category. Every weakness discussed in this review exists at the pinned commit. The three items that most risk being submerged inside larger findings are recorded in section 3 under pre-existing weaknesses requiring renewed attention.

## 14. Disagreements

| Related item | Sol position | Opus position | Evidence for each | Final status |
| --- | --- | --- | --- | --- |
| SR-006 cache-control narrowing | The narrowing is withdrawn; document propagation is unverified and cannot narrow THR-009 | Same | Both: the loader `data()` call, the loader-level unit test, the absence of any `headers` export, and no captured document response | Resolved by evidence |
| SR-005 severity | Medium, with the open redirect driving the rating | Same | Both: `next_path.ts:5-15`, `login.tsx:16-24`, WHATWG backslash normalisation | Resolved by evidence |
| SR-008 likelihood | High, on the quantified multiplier and duplicate evaluation | Same; the ~2,500-leaf figure independently re-derived as a hard ceiling | Both: `search.py` constants and control flow at lines 26-30, 340-343, 354-357, 405-438, 172-179, 231-239 | Resolved by evidence |
| SR-002 and SR-015 blast radius | The shipped database branch reaches server-program and server-file authority in the database container | Same; Sol's container-scoped phrasing is more precise than iteration 1's | Both: `versions.py:58-66`, `migrate.py:100-103`, `compose.yaml:6-11`, PostgreSQL documentation | Resolved by evidence |
| SR-009 role-separation feasibility | Required, but conditional on a restore-point design change or an isolated privilege | Same | Both: `migrate.py:100-103`, `versions.py:58-66` | Resolved by evidence |
| SR-007 reference scope | Same-class extraction stays in SR-007; cross-class disclosure becomes SR-016 | Same, and SR-016's Low impact is corroborated by the FK target inventory | Sol: `fk_enrichment.py`, source-only RBAC. Opus: the same, plus the shipped FK inventory and `user.yaml` | Resolved by evidence |
| THR-019 and THR-027 accounting | Both are coverage gaps, not finding links | Same | Both: no implementation exists | Resolved by evidence |
| Prior-tolerance accounting | No prior tolerance decision exists for SR-001 to SR-013 | Same | Both: TM-REV-001 section 15 | Resolved by evidence |
| SR-014 and SR-019 severity recording | `Informational` severity with impact and likelihood values that produce `Low` | The combination is not available under the accepted matrix; impact and likelihood should be `Not applicable`, per the consolidation template's own vocabulary | Sol: its rating-method paragraph and the two finding records. Opus: matrix section 9, `findings.template.md:105-106` | Open — no Sol response exists; raised at the final adversarial pass, and mechanically resolvable by the consolidator |
| SR-014 surface parity | The surfaces differ only in FK enrichment | They also differ in operations: create, update and delete exist only on legacy, so the deprecated surface is the sole write surface | Sol: `router_factory.py:26-217` cited generally. Opus: the same file at lines 44-56 and 177-215, plus `main.py:20-34` | Open — no Sol response exists; a description and removal-condition correction, not a rating change |
| Coverage of authorized destruction | THR-017 is covered by SR-007, SR-009 and SR-017 | Those cover unrecorded reads and privileged direct SQL; authorized API deletion destroys data and attribution together and is covered by none of them | Sol: SR-009's database-authority preconditions and likelihood. Opus: `store.py:181-190`, `router_factory.py:199-215`, `system_fields.py` | Open — no Sol response exists; carried to consolidation as a missed-finding candidate |
| Coverage of shipped attribution defaults | THR-015 is covered by SR-009 through the non-HTTP stub path | The collision already appears as a shipped domain-field default in `change-request.yaml` | Sol: `actor.py`, `seed/users.py:11-12`, `migrate.py:105-115`. Opus: `change-request.yaml`, `field_meta.ts:50` | Open — no Sol response exists; carried to consolidation as a Low missed-finding candidate |

No item in this table is an unresolved Sol/Opus disagreement. The first eight were resolved by evidence during iteration 2. The last four are new Opus positions raised at the final adversarial pass, on which Sol has taken no contrary view because no further pass exists; they are recorded as open items for consolidation rather than as contested positions.

## 15. Validated strengths

| Sol item | What was verified | Evidence | Residual uncertainty |
| --- | --- | --- | --- |
| SR-016's Low impact rating | I attempted to raise it and could not. Every enrichment-reachable target in the shipped definitions is `user`; its display attribute is `display-name`; it declares no friendly-id; and the plan selects only display and friendly columns, so `username` and `password-hash` are unreachable by this path | `fk_enrichment.py:56-158`; `user.yaml`; `incident.yaml`; `change-request.yaml` | Forward-looking only: CMDB and integration-credential references will change the answer |
| SR-008's re-derived multiplier | The ~2,500-leaf figure is a hard ceiling, not an estimate: entry at depth 1, rejection above depth 3, fifty children per logical node, and children compiled at `depth + 1`, so a `not` at depth 3 is rejected | `search.py:340-343, 354-357, 405-438` | Saturation thresholds remain unmeasured |
| SR-006's withdrawal of the cache-control narrowing | Sol declined to retain a narrowing of accepted intent that it could not evidence, and recorded the withdrawal in three places rather than quietly dropping it | Sol `security-review.md:551, 575, 599, 1713` | The substantive header question is still open |
| SR-018's framing of the ADR 002 trade | The finding records the concentration as a verified blast-radius property explicitly without reopening the architectural decision, which is the condition TM-REV-001 attaches to accepting it | Sol `security-review.md:1419`; `session.server.ts:20-47`; `api.server.ts:26-90` | None |
| SR-012's and SR-004's crediting of the refresh-token discard | `api.server.ts:46-50` genuinely drops the refresh token and never returns or retains it, which bounds what a resident SSR attacker can persist with | `api.server.ts:26-51` | Reuse detection remains absent, as SR-004 says |
| SR-003's control ordering | The recommendation bounds body and password length before introducing a dummy verification, which is the sequence that avoids handing an attacker more work | Sol `security-review.md:357, 369` | Thresholds unmeasured |
| SR-004's crediting of per-request account and permission resolution | `get_current_user` re-reads the user row and rejects inactive accounts on every request, and permissions resolve from the database per request, so revocation is immediate. This genuinely bounds SR-004 to session continuation | `auth/dependencies.py:33-51`; `rbac/store.py:34-58` | None |
| Not claimed by Sol — refresh rotation and digest handling | `_claim_valid_refresh` performs a single atomic `UPDATE … WHERE revoked_at IS NULL AND expires_at > now RETURNING`, so two concurrent claimants cannot both succeed; tokens are `secrets.token_urlsafe(32)` and only their SHA-256 digests are stored; `rotate_refresh_token` commits the revocation and fails closed when the user is inactive | `auth/store.py:74-105, 138-160`; `auth/tokens.py:53-60` | Reuse detection remains absent |
| Not claimed by Sol — writable models exclude system fields | Generated `Create` and `Update` models omit `id`, `created_at`, `updated_at`, `created_by` and `updated_by` and set `extra='forbid'`, so a client cannot forge attribution through the API. This bounds THR-015 to non-HTTP paths and, importantly for AR-016, means `created_by` stays truthful | `mapping/emit_pydantic.py:92-131`; `mapping/system_fields.py`; `router_factory.py:54-55, 192` | None |
| Not claimed by Sol — configuration-to-code boundary | Class and attribute names are constrained to alphanumeric kebab segments, types resolve through a closed map, DDL identifiers are composed via `sql.Identifier`, SQL type text comes only from `YAML_TO_POSTGRES`, and generated docstrings escape backslashes and triple quotes | `mapping/definition.py:130-477`; `schema/ddl.py`; `persistence/sql_types.py`; `mapping/emit_pydantic.py:158-162` | Re-review when externally authored definitions become loadable |
| Not claimed by Sol — web-tier fail-closed configuration | `assert_web_auth_config` requires both the session secret and the API base URL, `require_session_secret` refuses to build storage without a secret, and `cookie_secure_from_env` defaults `Secure` on and throws on an unrecognised value rather than guessing | `config.server.ts:6-45`; `session.server.ts:20-28` | The contrast with the API tier is the substance of SR-001, SR-002 and SR-006 |

## 16. Unknowns and required evidence

| Related item | Unknown or gap | Why it matters | Evidence or decision needed |
| --- | --- | --- | --- |
| SR-015 / AR-001 | The privilege level a real production deployment's database role holds, and whether any customer has been told to split migration privilege from runtime privilege | Decides whether SR-002's consequence stops at data or reaches the database container, and whether SR-009's role separation is implementable | Deployment guidance for database roles; a product decision on whether the restore point becomes optional or separately privileged. Note that Sol's own unknowns table carries this row but its uncertainty count omits it (AR-013) |
| SR-006 / AR-006 | Whether `Cache-Control: private, no-store` reaches the SSR document response | Decides whether an accepted threat-model claim may be narrowed at all | A captured document response from a built web tier, or a route `headers` export |
| SR-003, SR-008 / AR-004, AR-005 | Actual saturation thresholds for the Argon2 path and for amplified predicates | Sets operational likelihood and the numeric values of any cap | Local load fixtures with representative data volume, as both reports record |
| SR-016 / AR-002 | Which classes become reachable through FK enrichment as CMDB and integration credentials land | Decides whether SR-016 stays Medium or becomes a primary confidentiality control | The referenced-class inventory at the point attribute-level authorization is designed |
| AR-015 | Whether customers will in practice grant `{class}:delete` to non-admin roles, which today requires direct database work because no role-management API exists | Sets AR-015's likelihood, which is Low precisely because the seeded catalogue grants no delete key | Deployment and role-design guidance; a product decision on delegating delete |
| AR-015 | Whether record deletion should be soft, and whether a durable deletion event is required before production release | Determines whether authorized destruction remains unreconstructable from the product alone | Human product and security-design decision |
| THR-011, ASM-019 | Whether record-level authorization will exist, and on what model | The largest present exposure; neither review can close it | Human architect decision, then security design |
| THR-026 / AR-014 | The removal condition for issue #117, given that create, update and delete exist only on the legacy surface | Decides when the deprecated surface can actually be removed, and where write-side authorization will live | A recorded deprecation condition under AGENTS.md section 3.9, most plausibly "write routes versioned" |
| THR-019, THR-027, THR-028, ASM-010, ASM-021, ASM-023 | Sandbox isolation model, customization host and call identity, tier identity mechanism and normalisation rule, additive-only semantics | Four unbuilt controls carry impact reductions elsewhere in the accepted model; no code analysis can advance them | Design closure on U1, U6, U7 and issue #116 |
| SR-012 | Whether any currently pinned dependency carries a known advisory | Neither review scanned; both are explicit that no such claim is made | An authorized SCA, SBOM and provenance run |
| SR-019 / AR-011 | Whether removing the demo definitions from a production artefact is straightforward | `demo-link` references `demo-item`, so partial removal fails definition loading closed | A production build profile that excludes both definitions, their generated models, the seed grants, and the probe route together |

## 17. Final handoff

### Iteration 1 requests for Sol refinement

Not applicable. This is iteration 2, the final automated adversarial pass. All twelve iteration 1 requests were answered and are dispositioned in section 9. No further automated Sol or Opus pass is requested or required.

### Iteration 2 items for consolidation

- **Carry all nineteen Sol findings as substantiated**, with the ratings as recorded, except for the two severity-recording corrections below. Every finding's evidence was independently verified against the pinned commit and none was found unsupported, overstated, or misrated on the matrix.
- **AR-013 — apply one severity-recording convention.** Set impact and likelihood to `Not applicable` for SR-014 and SR-019 and retain `Informational`, per `findings.template.md`'s `Not applicable for Informational only` vocabulary; recompute the severity distribution and record that `Low: 0` follows from the convention rather than from the matrix; and add SR-015 to the material-uncertainty set that feeds `Candidate — validation needed`. This is a mechanical transcription decision. It also applies to this review's own iteration 1 AR-011 candidate severity, restated as Low in section 7.
- **AR-014 — correct SR-014's parity description and record the removal condition.** State that create, update and delete exist only on the legacy surface; record "write routes versioned" as the concrete precondition for issue #117 under AGENTS.md section 3.9; and note under SR-007 and SR-016 that future write-side reference or attribute authorization has only one implementation point today. No rating change.
- **AR-015 — carry the unrecorded authorized-destruction gap as a missed-finding candidate at Medium**, either as its own record or as an explicitly evidenced branch of SR-009 with its own likelihood justification, because SR-009's current Medium likelihood reasoning about infrastructure authority does not describe an ordinary API route. Record the seeded-permission bound that holds it at Low likelihood, so the rating is not read as unconditional.
- **AR-016 — carry the shipped attribution default as a missed-finding candidate at Low**, linked to THR-015 rather than treated as new territory, and record the general observation that shipped class definitions can carry attribution defaults and were examined by neither report.
- **Preserve the three pre-existing items in section 3** as visible in their own right: the stub-actor collision, the absence of any product-side security event stream in its destructive case, and the legacy surface's status.
- **Record the AR-008 residual** as a one-word fix rather than an analysis item: SR-018's finding-summary row lists THR-028 without the "decision input only" qualifier its coverage row carries.
- **Record the SR-019 recommendation caveat**: `demo-link` references `demo-item`, so both demo definitions must be excluded from a production artefact together, or definition loading fails closed at every entry point.
- **Zero unresolved Sol/Opus disagreements.** The eight material differences from iteration 1 were all resolved by evidence. The four new Opus positions above have no Sol response because no further pass exists and must not be recorded as contested.

### Items requiring human judgment

- Whether the product should guarantee that the application runtime can operate under a non-superuser database role, which requires a decision about the restore point in the migration path (SR-015, AR-001).
- Whether foreign-key attributes should inherit view permission from the referenced class, and what the exact reference-visibility semantics should be under ASM-025's indistinguishability principle (SR-016, AR-002).
- Whether the accepted THR-009 claim may be narrowed at all on loader-level evidence, which is a question about evidentiary standards for amending accepted intent as much as about caching (SR-006, AR-006).
- Whether the web tier's confirmed credential concentration should be recorded as a standing constraint on the THR-028 host decision, given that TM-REV-001's acceptance of ADR 002 is explicitly conditional on the concentration remaining visible (SR-018, AR-009).
- Whether a durable, exportable deletion event is required before production release, and whether record deletion should additionally become soft. This is the only new human decision this iteration adds, and it is a product-design question rather than a missing piece of evidence (AR-015).
- What removal condition should be attached to issue #117, given that the deprecated surface is the only write surface (SR-014, AR-014).

## 18. Completion

Critique counts:

- New: 4 (AR-013, AR-014, AR-015, AR-016)
- Addressed: 12 (AR-001 to AR-012)
- Partially addressed: 0
- Unresolved: 0
- Withdrawn: 0
- Missed-finding candidates: 2 (AR-015 at Medium, AR-016 at Low)
- Severity challenges: 1 critique affecting 2 findings (AR-013 on SR-014 and SR-019). No finding's matrix-derived severity is challenged; the challenge is to the recording of `Informational` alongside matrix-producing impact and likelihood, and to the derived counts.
- Provenance challenges: 0 (full-review mode; no provenance was assigned, and none was incorrectly asserted)
- Prior-acceptance reconsiderations: 7 recorded in section 11 — 4 corresponding to Sol's own rows (SR-014, SR-015, SR-016, SR-018), 1 confirming the AR-010 correction for SR-001 to SR-013, SR-015 to SR-017 and SR-019, 1 new for AR-016, and 1 for ASM-007
- Candidate severity distribution across the 16 critiques: High 3 (AR-001, AR-004, AR-005), Medium 6 (AR-002, AR-003, AR-006, AR-007, AR-009, AR-015), Low 3 (AR-011, AR-012, AR-016), Not applicable 4 (AR-008, AR-010, AR-013, AR-014)

Completion checks:

- [x] Inputs match the run manifest and pinned hashes.
- [x] Every Sol finding is accounted for.
- [x] Every meaningful Sol no-finding claim is independently accounted for.
- [x] Every critique has evidence and requested treatment.
- [x] Missed threats and legitimate-user abuse were independently considered.
- [x] Every identified pre-existing weakness remains visible.
- [x] Every identified previously accepted weakness has a current reassessment.
- [x] Diff provenance is challenged when applicable — not applicable in full-review mode, and Sol's handling of that is verified correct.
- [x] Iteration 2 accounts for every iteration 1 critique.
- [x] Iteration 2 maps every unresolved critique, missed-finding candidate, and human question into the final handoff.
- [x] Iteration 2 requests no further automated Sol or Opus pass.
- [x] Unresolved disagreements and uncertainty are preserved.
- [x] Summary tables match authoritative detailed records.

All applicable checks pass.
