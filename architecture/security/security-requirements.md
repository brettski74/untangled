# Untangled ITSM Security Requirements

Status: Accepted
Revision: SREQ-REV-001
Source revision: TM-REV-001; review run 20260803T113549Z-f074efdc579f-full-review-de0326
Supersedes: None
Prepared date: 2026-08-03
Accepted date: 2026-08-03
Accepted by: Brettski74

## 1. Purpose and scope

### Purpose

Define durable, testable security outcomes for the production deployment described by TM-REV-001, based on the first completed full security-review run and explicit human design decisions.

### In scope

- All 21 findings, 7 prior-risk reassessments, and 8 human-decision inputs from review run `20260803T113549Z-f074efdc579f-full-review-de0326`.
- Implemented Milestone 1 authentication, sessions, records, search, schema, seed, API, SSR, container, and release-security surfaces.
- Forward requirements whose trigger is a named future capability, including non-browser refresh clients and direct browser-to-API authentication.

### Out of scope

- Threat-model exclusions: customer infrastructure, physical/data-centre security, vendor and customer CI/CD, customer forks, and shared-database multi-tenancy.
- Selecting the exact browser credential mechanism that will replace mandatory SSR proxying; its required outcomes and validation path are in scope.
- Record-level authorization beyond the explicit accepted-risk decision in section 7.

### Delivery horizon

- Required controls are production-readiness conditions unless a detailed requirement states another trigger.
- Deferred controls retain the interim treatment and review trigger stated in their detailed records and section 8.

## 2. Input snapshot

### Governing architecture inputs

| Input | Revision | Source commit | SHA-256 |
| --- | --- | --- | --- |
| Threat model | TM-REV-001 | `f074efdc579fb215ff6c86e466edce6d23c93e64` | `5d27340e3e3e48d2a7e51a6163ccbebe920d7e5db9c8a273c89c663abc062adf` |
| Previous security requirements | None | None | None |

### Security-review inputs

| Run ID | Findings path | Source commit | SHA-256 | Scope |
| --- | --- | --- | --- | --- |
| `20260803T113549Z-f074efdc579f-full-review-de0326` | `security/reviews/20260803T113549Z-f074efdc579f-full-review-de0326/findings.md` | `d5125a39b9eab2ab770773bb44cc7e263c565757` | `a27c2c5150e0265e63923dcc355f372d812b0e1fe2a00bc99807c5ac01880df2` | Full TM-REV-001 scope and implemented Milestone 1 code at `f074efdc579fb215ff6c86e466edce6d23c93e64` |

### Human design context

| Decision context | Human-confirmed position | Date |
| --- | --- | --- |
| Scope and horizon | Dispose all 36 run-qualified inputs; required controls target first production release | 2026-08-03 |
| Model verification | Human waived inability to verify the required GPT-5.6 Sol Medium reasoning tier | 2026-08-03 |
| Browser/API direction | Direct browser-to-API calls are required without JavaScript-readable credentials; exact mechanism remains validation-required | 2026-08-03 |
| Residual row access | Retain class-wide row access with bulk-read controls; reconsider when a customer requires record-level segregation | 2026-08-03 |
| Full audit pipeline | Core security events are required now; tamper evidence, SIEM export, and database-level audit trigger on customer SIEM demand | 2026-08-03 |

## 3. Security design principles

- Production-capable paths fail closed on absent, known, or development-only credentials.
- Security limits constrain computational work, not merely response size.
- Authorization applies to every datum returned, including cross-class reference enrichment.
- Security-relevant actions are durably attributable even when the affected domain row no longer exists.
- Browser credentials remain inaccessible to JavaScript without making SSR a permanent API proxy.
- Production artifacts exclude development-only schema, permissions, routes, helpers, and credentials.
- Deferred controls remain visible with interim treatment and objective reconsideration triggers.
- Customer-owned infrastructure is not credited as a product control unless the product verifies a documented deployment contract.

## 4. Requirement summary

| Priority | Requirement ID | Requirement | Status | Delivery horizon | Related threats |
| --- | --- | --- | --- | --- | --- |
| Critical | SEC-AUTH-001 | JWT signing and claim integrity | Required | Before production | THR-001, THR-006 |
| Critical | SEC-AUTH-002 | Production bootstrap credential safety | Required | Before production | THR-002 |
| High | SEC-AVAIL-001 | Bounded authentication work | Required | Before production | THR-003, THR-004, THR-005 |
| High | SEC-AVAIL-002 | Bounded search and database work | Required | Before production | THR-013 |
| Medium | SEC-AUTHZ-001 | Authorized reference enrichment | Required | Before production | THR-011, THR-012, THR-026 |
| High | SEC-AUDIT-001 | Core durable security events | Required | Before production | THR-003, THR-007, THR-012, THR-015, THR-017 |
| High | SEC-AUDIT-002 | Protected audit export and privileged database audit | Deferred | Customer requests SIEM integration | THR-014, THR-017 |
| High | SEC-OPS-001 | Least-privilege database identities | Required | Before production | THR-002, THR-014, THR-020, THR-021 |
| Medium | SEC-OPS-002 | Secret-safe operator output | Required | Before production | THR-002, THR-014, THR-017 |
| Medium | SEC-SESS-001 | Bounded and revocable access sessions | Required | Before production | THR-006 |
| Medium | SEC-SESS-002 | Refresh-family replay response | Deferred | Before non-browser refresh clients | THR-007 |
| Medium | SEC-WEB-001 | Login request and redirect integrity | Required | Before production | THR-008 |
| High | SEC-WEB-002 | Production transport and response hardening | Required | Before production | THR-009, THR-023 |
| Medium | SEC-SESS-003 | Browser-direct API authentication without JavaScript-readable credentials | Required | Before direct browser API use in production | THR-024, THR-028 |
| High | SEC-API-001 | Minimal anonymous and error surface | Required | Before production | THR-016 |
| Low | SEC-OPS-003 | Production artifact profile | Required | Before production | THR-016 |
| High | SEC-SDLC-001 | Dependency and container assurance gate | Required | Before production | THR-021, THR-024 |
| High | SEC-SDLC-002 | Private vulnerability intake | Required | Before production | THR-022 |
| High | SEC-SDLC-003 | Advisory, support, and customer notification process | Deferred | First production release preparation or credible report | THR-022 |
| Medium | SEC-DATA-001 | Destructive helpers excluded from production code | Required | Before production | THR-020, THR-027 |
| Low | SEC-API-002 | API-version security invariants and legacy-read removal | Required | Before production | THR-026 |
| Low | SEC-AUDIT-003 | Domain and system actor identity integrity | Required | Before production | THR-015, THR-017 |

This table is derived from the detailed requirement records, which are authoritative.

## 5. Detailed requirements

### SEC-AUTH-001 — JWT signing and claim integrity

- Status: Required
- Priority: Critical
- Applicability: Every access JWT issuer and verifier
- Delivery horizon: Before production
- Related threats: THR-001, THR-006
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-001`
- Prior requirements: None
- Supersedes: None
- Dependencies: Key-management design under issue #67
- Human decision reference: Group 1 decision, 2026-08-03

#### Normative requirement

Every production-capable issuer MUST require explicit high-entropy signing material, MUST reject missing and known development values, and MUST NOT silently generate or select a shared fallback. Verifiers MUST require `sub`, `typ`, `iat`, and `exp`, enforce an approved algorithm and bounded lifetime, and bind issuer or audience when more than one trust domain exists.

#### Rationale

Published signing material and optional expiry claims permit arbitrary, potentially non-expiring administrator tokens.

#### Implementation flexibility

Symmetric or asymmetric signing is permitted if key custody, rotation, trust-domain binding, and verifier configuration meet the outcome.

#### Verification criteria

1. Production startup fails for missing or known signing material.
2. Tokens missing each mandatory claim, exceeding lifetime bounds, or signed with repository-known material are rejected.
3. Key rotation and failure behavior are documented and tested.

#### Operational and failure considerations

- Failure is closed and observable without logging secret values.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Signing algorithm, issuer topology, or key-custody changes.

### SEC-AUTH-002 — Production bootstrap credential safety

- Status: Required
- Priority: Critical
- Applicability: Seed, database bootstrap, and production-capable deployment paths
- Delivery horizon: Before production
- Related threats: THR-002, THR-014
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-002`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-OPS-001
- Human decision reference: Group 1 decision, 2026-08-03

#### Normative requirement

Production-capable seed and database paths MUST reject absent, published, or known development credentials before mutation. Bootstrap credentials MUST be unique per deployment and either be generated securely or supplied explicitly, and initial human credentials MUST require controlled establishment or first-use replacement.

#### Rationale

Published seed and database credentials currently provide complete application or database authority.

#### Implementation flexibility

Environment classification, explicit local fixtures, secret-manager integration, and bootstrap ceremonies may vary, provided local convenience cannot silently become production configuration.

#### Verification criteria

1. Production seed and startup fail before mutation with absent or known credentials.
2. A fresh production deployment has no credential derivable from repository content.
3. Bootstrap completion leaves no reusable default administrative credential.

#### Operational and failure considerations

- Recovery instructions cover partial bootstrap without reintroducing defaults.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- New bootstrap, recovery, or deployment mechanisms.

### SEC-AVAIL-001 — Bounded authentication work

- Status: Required
- Priority: High
- Applicability: Local login and every password-verification path
- Delivery horizon: Before production
- Related threats: THR-003, THR-004, THR-005
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-003`
- Prior requirements: None
- Supersedes: None
- Dependencies: Core security-event support in SEC-AUDIT-001
- Human decision reference: Group 2 and HDN-007 decisions, 2026-08-03

#### Normative requirement

Authentication endpoints MUST bound body and credential size before expensive work, apply abuse-resistant per-account and per-source throttling, and enforce a global password-hash concurrency budget or equivalent isolation so anonymous work cannot monopolize authenticated traffic. Unknown and inactive accounts MUST use timing treatment that does not create an unbounded work amplifier.

#### Rationale

Anonymous callers can currently drive unbounded Argon2 work in the shared API worker pool and distinguish active usernames.

#### Implementation flexibility

Static limits are sufficient for initial production. Hard lockout is not required; implementations may use queues, token buckets, backoff, isolated executors, or equivalent bounded controls.

#### Verification criteria

1. Oversized inputs are rejected before hashing.
2. Concurrency and throttle limits remain bounded under deterministic functional tests.
3. Record and control routes remain schedulable when authentication reaches its configured budget.
4. Privacy-conscious authentication events are emitted.

#### Operational and failure considerations

- Throttles must fail safely without enabling trivial account-lockout denial of service.

#### Deferral terms

Not applicable. Representative load testing is not an initial production gate; observed production saturation pressure triggers reassessment.

#### Review and supersession triggers

- Telemetry approaches configured hash, queue, memory, or worker budgets; any authentication availability incident.

### SEC-AVAIL-002 — Bounded search and database work

- Status: Required
- Priority: High
- Applicability: Search, count, predicate, sort, pagination, and database connection paths
- Delivery horizon: Before production
- Related threats: THR-012, THR-013
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-006`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-AUDIT-001
- Human decision reference: Group 2 and HDN-007 decisions, 2026-08-03

#### Normative requirement

Interactive queries MUST have statement deadlines, bounded connection concurrency, total predicate and pattern limits, bounded sort and offset cost, and per-principal work budgets. Expensive operators such as regular expressions MAY remain only when their worst-case work is statically bounded or separately authorized and contained.

#### Rationale

One class reader can currently multiply thousands of regexp leaves across unconditional count and select work with no deadline or connection budget.

#### Implementation flexibility

The implementation may limit, approximate, omit, asynchronously compute, or separately authorize totals and expensive operators.

#### Verification criteria

1. Maximum accepted predicate, pattern, sort, and offset shapes are explicit and tested.
2. Queries exceeding time or concurrency budgets terminate without exhausting the shared database.
3. Per-principal repeated expensive work is throttled and recorded.

#### Operational and failure considerations

- Timeout and pool exhaustion must produce bounded errors and release transaction state.

#### Deferral terms

Not applicable. Representative load testing is not an initial production gate; observed production saturation pressure triggers reassessment.

#### Review and supersession triggers

- Query telemetry approaches configured budgets, corpus scale changes materially, or any search-related availability incident.

### SEC-AUTHZ-001 — Authorized reference enrichment

- Status: Required
- Priority: Medium
- Applicability: Every foreign-key or cross-class identity enrichment surface
- Delivery horizon: Before production
- Related threats: THR-011, THR-012, THR-026
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-015`
- Prior requirements: None
- Supersedes: None
- Dependencies: Common authorization resolution
- Human decision reference: FND-015 and HDN-002 ruling, 2026-08-03

#### Normative requirement

A principal MUST hold ordinary read authority for the referenced class and returned attribute before reference enrichment returns display, friendly, or identity content. Unauthorized enrichment MUST use the same non-existence behavior across fetch, search, metadata, and serialization surfaces.

#### Rationale

Current v1 enrichment exposes user display names to principals without user-class read authority.

#### Implementation flexibility

Authorization may be resolved in a common attribute resolver, query planner, or enrichment layer, but serialization-only filtering is insufficient.

#### Verification criteria

1. Source-only principals cannot retrieve or distinguish referenced display content.
2. Predicate, sort, count, fetch, and search surfaces cannot bypass the target authorization rule.
3. Tests cover every reference target class.

#### Operational and failure considerations

- Authorization lookup cost must be bounded and consistently cached only within an authorized request context.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Attribute-level authorization or reference-display policy is redesigned.

### SEC-AUDIT-001 — Core durable security events

- Status: Required
- Priority: High
- Applicability: Authentication, bulk reads, role and permission changes, session security, deletion, and privileged application operations
- Delivery horizon: Before production
- Related threats: THR-003, THR-007, THR-012, THR-015, THR-017
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-005`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-007`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-018`
- Prior requirements: None
- Supersedes: None
- Dependencies: Stable actor identities
- Human decision reference: Group 3 decisions, 2026-08-03

#### Normative requirement

The product MUST durably record security-relevant authentication outcomes, session revocation or replay signals, role and permission changes, attributable bulk-read activity, and record deletion. A deletion event MUST be committed with actor, class, locator, and timestamp before the domain row and its attribution are removed. Events MUST distinguish human, system, and operator channels.

#### Rationale

Current activity can extract, alter, or delete data without evidence sufficient for detection or reconstruction.

#### Implementation flexibility

Hard deletion may remain. Event schema and storage may begin in PostgreSQL; tamper evidence, SIEM export, and database-level privileged audit are separately deferred.

#### Verification criteria

1. Each named event class has actor, action, target, outcome, timestamp, and correlation data appropriate to the action.
2. Bulk-read events and configured volume limits detect repeated corpus extraction.
3. Deletion metadata remains queryable after hard deletion.
4. Event-write failure prevents the consequential action where loss of evidence would be unsafe.

#### Operational and failure considerations

- Event payloads must avoid credentials and unnecessary sensitive record content.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- New privileged channels, event bus, retention obligations, or external audit integrations.

### SEC-AUDIT-002 — Protected audit export and privileged database audit

- Status: Deferred
- Priority: High
- Applicability: Security-event storage, direct database administration, and customer SIEM integration
- Delivery horizon: Triggered when a customer requests SIEM integration
- Related threats: THR-014, THR-017
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-007`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-AUDIT-001, SEC-OPS-001
- Human decision reference: FND-007 deferral ruling, 2026-08-03

#### Normative requirement

When triggered, audit evidence MUST be protected against ordinary application and operator alteration, exported through a documented SIEM-compatible interface, and supplemented by database-level evidence for privileged changes that bypass application controls.

#### Rationale

Application events alone cannot prove actions performed or erased through direct privileged database access.

#### Implementation flexibility

Append-only storage, external sinks, cryptographic chaining, database audit facilities, and export formats remain design choices.

#### Verification criteria

1. A privileged database change produces evidence outside the changed data's ordinary trust path.
2. Export supports reliable ordering, identity, integrity checking, and retry.
3. Authorized retention and deletion behavior is documented and tested.

#### Operational and failure considerations

- Export failure must be observable and must not silently discard evidence.

#### Deferral terms

- Interim treatment: SEC-AUDIT-001 core events and SEC-OPS-001 role separation.
- Owner or decision path: Security design and customer-integration refinement.
- Review trigger or deadline: A customer requests SIEM integration.
- Risk while deferred: A sufficiently privileged database operator can alter application data and application-held evidence.

#### Review and supersession triggers

- Regulatory commitments or customer audit requirements arise before the stated trigger.

### SEC-OPS-001 — Least-privilege database identities

- Status: Required
- Priority: High
- Applicability: Runtime, migration, seed, and human database access
- Delivery horizon: Before production
- Related threats: THR-002, THR-014, THR-020, THR-021
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-011`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-002`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-007`
- Prior requirements: None
- Supersedes: None
- Dependencies: Deployment database-role provisioning
- Human decision reference: FND-011 and HDN-001 ruling, 2026-08-03

#### Normative requirement

Runtime, migration, seed, and human access MUST use separately scoped identities. Runtime and ordinary seed identities MUST NOT hold superuser, server-program, server-file, unrelated DDL, or equivalent privilege. Restore-point or other exceptional migration privilege MUST be optional or isolated so it cannot force privileged runtime credentials.

#### Rationale

The shipped shared bootstrap-superuser role turns application or credential compromise into database-container command and file authority.

#### Implementation flexibility

Restore points may remain under a separate migration step or role; the requirement does not mandate their removal.

#### Verification criteria

1. A role matrix demonstrates allowed and denied runtime, seed, migration, restore-point, file, program, and DDL operations.
2. Production startup rejects runtime credentials with forbidden privilege.
3. Compromise of runtime credentials cannot alter RBAC schema or execute server programs.

#### Operational and failure considerations

- Privileged migration credentials are not present in runtime process environments.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Migration, restore, managed-PostgreSQL, or deployment-role changes.

### SEC-OPS-002 — Secret-safe operator output

- Status: Required
- Priority: Medium
- Applicability: Every CLI, migration, seed, diagnostic, and startup message
- Delivery horizon: Before production
- Related threats: THR-002, THR-014, THR-017
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-016`
- Prior requirements: None
- Supersedes: None
- Dependencies: Common redaction utility or equivalent
- Human decision reference: Group 1 decision, 2026-08-03

#### Normative requirement

Operator output MUST NOT print passwords, tokens, signing material, raw credential-bearing URLs, or effective seed secrets. It MAY identify the configuration source and a non-secret endpoint after credential-safe redaction.

#### Rationale

Current CLIs copy live database and seed secrets into terminal, CI, diagnostic, and collaboration logs.

#### Implementation flexibility

Redaction may be centralized or enforced at each output boundary.

#### Verification criteria

1. Canary secrets supplied to every operator path do not appear in stdout or stderr.
2. URL redaction handles encoded credentials and parsing failures safely.

#### Operational and failure considerations

- Error handling must redact before formatting exceptions.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- New CLI or diagnostic surfaces.

### SEC-SESS-001 — Bounded and revocable access sessions

- Status: Required
- Priority: Medium
- Applicability: Browser and non-browser access sessions
- Delivery horizon: Before production
- Related threats: THR-006
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-012`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-001`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-AUTH-001, SEC-AUDIT-001
- Human decision reference: FND-012 staged ruling, 2026-08-03

#### Normative requirement

Access sessions MUST have enforced issuance and expiry bounds and MUST support prompt individual and user-wide termination without waiting for maximum token expiry. Authorization MUST continue to resolve live account and permission state rather than embedding stale authorization grants in a session credential.

#### Rationale

Logout and incident response cannot currently terminate access JWTs, while operator-configurable lifetimes have no ceiling.

#### Implementation flexibility

Revocation may use token identifiers, session records, generation counters, opaque sessions, or another measured mechanism.

#### Verification criteria

1. Logout, administrative revocation, and account deactivation deny the affected session within the documented propagation bound.
2. Lifetime configuration has safe minimum and maximum bounds.
3. Permission changes continue to take effect promptly.

#### Operational and failure considerations

- Revocation-store failure behavior is explicit and security-reviewed.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Browser credential mechanism, token format, or session store changes.

### SEC-SESS-002 — Refresh-family replay response

- Status: Deferred
- Priority: Medium
- Applicability: Any client that receives or retains refresh tokens
- Delivery horizon: Before non-browser refresh clients are released
- Related threats: THR-007
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-012`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-AUDIT-001
- Human decision reference: FND-012 staged ruling, 2026-08-03

#### Normative requirement

Before a client may retain refresh tokens, refresh rotation MUST preserve family lineage, detect replay, invalidate the affected family or stronger scope, and emit a security event.

#### Rationale

Atomic rotation prevents double claim but does not distinguish theft from ordinary expiry or terminate an attacker-controlled chain.

#### Implementation flexibility

Sender constraint or standards-aligned reuse detection may satisfy the outcome.

#### Verification criteria

1. Rotate, replay-before-holder, replay-after-holder, logout, and revocation sequences produce the specified denial and events.
2. Family data has bounded retention and privacy handling.

#### Operational and failure considerations

- False-positive replay response must have a documented recovery path.

#### Deferral terms

- Interim treatment: The SSR client discards refresh tokens; rotation remains atomic and digest-only.
- Owner or decision path: Authentication/session refinement.
- Review trigger or deadline: Before any non-browser or other client retains refresh tokens.
- Risk while deferred: A future retained refresh token could sustain an undetected attacker-controlled chain.

#### Review and supersession triggers

- OAuth/OIDC, integrations, service accounts, or mobile clients.

### SEC-WEB-001 — Login request and redirect integrity

- Status: Required
- Priority: Medium
- Applicability: Browser login and post-authentication navigation
- Delivery horizon: Before production
- Related threats: THR-008
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-013`
- Prior requirements: None
- Supersedes: None
- Dependencies: Browser origin configuration
- Human decision reference: Group 4 decision, 2026-08-03

#### Normative requirement

Login MUST reject cross-origin submission unless protected by an equivalent anti-CSRF mechanism. Redirect destinations MUST be parsed against a fixed trusted origin and accepted only when normalized to an allowed same-origin path.

#### Rationale

Current login permits forced sessions, and backslash normalization turns an accepted path into an external redirect.

#### Implementation flexibility

Origin validation, anti-CSRF tokens, or an equivalent bound interaction may protect login.

#### Verification criteria

1. Cross-origin login forms fail.
2. Redirect tests cover backslashes, encodings, controls, scheme confusion, and authenticated loader behavior.

#### Operational and failure considerations

- Rejections do not disclose account existence.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Login topology or browser session architecture changes.

### SEC-WEB-002 — Production transport and response hardening

- Status: Required
- Priority: High
- Applicability: Production web, API, proxy contract, and authenticated responses
- Delivery horizon: Before production
- Related threats: THR-009, THR-023
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-004`
- Prior requirements: None
- Supersedes: None
- Dependencies: Deployment topology and browser credential design
- Human decision reference: FND-004 and HDN-003 ruling, 2026-08-03

#### Normative requirement

The product MUST define a production security profile that refuses insecure cookie settings and undocumented insecure API transport. Authenticated responses MUST receive systemic private/no-store cache policy, framing protection, MIME-sniffing protection, and an application-compatible CSP. HSTS MUST be asserted at the documented TLS-terminating layer. THR-009 MUST NOT be narrowed based only on loader metadata.

#### Rationale

Current hardening depends on deployment choices, and repository tests do not prove headers reach raw SSR document responses.

#### Implementation flexibility

Headers and HTTPS assertions may be applied by the application or a required, verifiable deployment component.

#### Verification criteria

1. Raw production-profile SSR document, data, API, redirect, and error responses satisfy the header policy.
2. Insecure cookie or transport settings fail production readiness.
3. CSP tests cover all required assets without broad unsafe bypasses.

#### Operational and failure considerations

- Proxy trust and forwarded-header handling must be explicit and resistant to caller spoofing.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Deployment topology, TLS ownership, asset loading, or browser credential changes.

### SEC-SESS-003 — Browser-direct API authentication without JavaScript-readable credentials

- Status: Required
- Priority: Medium
- Applicability: Browser, API, and SSR authentication topology
- Delivery horizon: Before direct browser API use in production
- Related threats: THR-024, THR-028
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-017`
- Prior requirements: None
- Supersedes: None
- Dependencies: ADR 010; exact credential mechanism validation
- Human decision reference: FND-017 and HDN-004 ruling, 2026-08-03

#### Normative requirement

Browser-originated API calls MUST be able to reach the API without an application-level SSR proxy while credentials remain inaccessible to browser JavaScript. The API MUST authenticate browser requests independently, browser mutation requests MUST have explicit CSRF and origin protection, and SSR MUST NOT hold credential-signing authority merely to support browser sessions. The design MUST minimize credentials and plaintext authentication material exposed by SSR compromise.

#### Rationale

Mandatory SSR proxying creates long-term handler duplication and concentrates login credentials, session-signing authority, and access tokens in one process.

#### Implementation flexibility

JWT cookies, opaque server-side sessions, or another mechanism are permitted after validation. Non-browser Bearer authentication may remain.

#### Verification criteria

1. Browser JavaScript cannot read or export session credentials.
2. Browser API calls do not require corresponding SSR resource-route wrappers.
3. SSR compromise cannot mint arbitrary API identities from SSR-held signing material.
4. Threat analysis and tests cover CSRF, cookie scope, CORS/origin, revocation, SSR rendering, and deployment routing.

#### Operational and failure considerations

- Any credential also delivered to SSR remains within its compromise boundary and must be explicitly justified.

#### Deferral terms

Not applicable. Mechanism selection remains validation-required in section 10.

#### Review and supersession triggers

- Selection or implementation of the replacement for ADR 002.

### SEC-API-001 — Minimal anonymous and error surface

- Status: Required
- Priority: High
- Applicability: Public API routing, documentation, health, root, and validation errors
- Delivery horizon: Before production
- Related threats: THR-016
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-008`
- Prior requirements: None
- Supersedes: None
- Dependencies: Production profile
- Human decision reference: Group 5 decision, 2026-08-03

#### Normative requirement

Only a minimal liveness response MAY be anonymous in production. Documentation, OpenAPI, root metadata, and all other endpoints MUST be disabled or authenticated and authorized. Rejected input MUST NOT be echoed when it may contain credentials or sensitive values.

#### Rationale

Anonymous callers currently receive a complete route and model inventory plus verbose validation input.

#### Implementation flexibility

Documentation may be absent or restricted to an authorized role.

#### Verification criteria

1. Production-profile anonymous route inventory contains only the approved liveness endpoint.
2. Malformed secret-bearing requests do not echo submitted values.
3. Documentation authorization is tested independently from operation authorization.

#### Operational and failure considerations

- Liveness reveals no dependency, version, schema, or deployment detail.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- New operational or documentation endpoints.

### SEC-OPS-003 — Production artifact profile

- Status: Required
- Priority: Low
- Applicability: Production images, class definitions, generated models, seed catalog, and routes
- Delivery horizon: Before production
- Related threats: THR-016
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-021`
- Prior requirements: None
- Supersedes: None
- Dependencies: Build/deployment profile
- Human decision reference: Group 5 decision, 2026-08-03

#### Normative requirement

Production artifacts MUST exclude demo definitions, dependent demo definitions, generated demo models, demo permissions and grants, probe routes, and equivalent development scaffolding through an explicit reproducible profile.

#### Rationale

Development schema and permissions currently ship as part of the production-capable surface.

#### Implementation flexibility

Separation may occur during build, packaging, or deployment if the resulting inventory is deterministic and verifiable.

#### Verification criteria

1. Production migration, OpenAPI, generated-model, route, and permission inventories contain no demo object.
2. Dependency-linked demo definitions are excluded together.

#### Operational and failure considerations

- Unknown profile values fail closed rather than selecting development content.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Packaging or profile mechanisms change.

### SEC-SDLC-001 — Dependency and container assurance gate

- Status: Required
- Priority: High
- Applicability: Python and JavaScript dependencies and production containers
- Delivery horizon: Before production
- Related threats: THR-021, THR-024
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-009`
- Prior requirements: None
- Supersedes: None
- Dependencies: Authorized SCA, SBOM, and provenance tooling
- Human decision reference: FND-009 and HDN-008 ruling, 2026-08-03

#### Normative requirement

Production dependencies MUST be reproducibly locked with artifact integrity verification, represented in an SBOM, and checked through an authorized vulnerability and provenance process. Production containers MUST run as dedicated non-root identities with unnecessary capabilities, writable filesystem access, privilege escalation, and egress removed or explicitly justified.

#### Rationale

Compromised dependency code currently receives application secrets and unnecessary root-container privilege.

#### Implementation flexibility

Tooling and SBOM format are open, provided both ecosystems and final images are covered.

#### Verification criteria

1. A clean build verifies artifact integrity and produces an SBOM for shipped components.
2. Authorized scanning has no unaccepted release-blocking result.
3. Runtime tests verify user, capability, filesystem, secret, and egress boundaries.

#### Operational and failure considerations

- Scanner unavailability has an explicit release decision path and cannot silently pass.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- New ecosystem, build source, base image, or customization runtime.

### SEC-SDLC-002 — Private vulnerability intake

- Status: Required
- Priority: High
- Applicability: Stock releases and public repository
- Delivery horizon: Before production
- Related threats: THR-022
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-010`
- Prior requirements: None
- Supersedes: None
- Dependencies: Named response ownership
- Human decision reference: FND-010 deferral terms, 2026-08-03

#### Normative requirement

The project MUST publish a private vulnerability-reporting route, expected acknowledgement behavior, and response ownership before production.

#### Rationale

Deferring all disclosure capability until the first report is circular when reporters have no reliable private contact.

#### Implementation flexibility

Private repository reporting, dedicated email, or another monitored confidential channel may satisfy intake.

#### Verification criteria

1. An external reporter can locate and use the private channel.
2. A tabletop report reaches the accountable owner without public disclosure.

#### Operational and failure considerations

- Intake availability and ownership are reviewed when maintainers change.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- First credible report or first production release preparation.

### SEC-SDLC-003 — Advisory, support, and customer notification process

- Status: Deferred
- Priority: High
- Applicability: Stock production releases
- Delivery horizon: First production release preparation or first credible vulnerability report, whichever occurs first
- Related threats: THR-022
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-010`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-SDLC-002
- Human decision reference: FND-010 deferral terms, 2026-08-03

#### Normative requirement

When triggered, the project MUST define supported versions, affected-version determination, coordinated advisory publication, remediation release handling, and a customer notification path that does not depend on deployment telemetry.

#### Rationale

Self-hosted customers otherwise remain unaware of known exploitable versions.

#### Implementation flexibility

Advisories, mailing lists, feeds, release channels, or documented customer contacts may be combined.

#### Verification criteria

1. A tabletop covers intake, triage, embargo, affected versions, fix, advisory, and notification.
2. Customers can determine whether a stock version is supported and affected.

#### Operational and failure considerations

- Fork assurance remains out of scope and is stated clearly.

#### Deferral terms

- Interim treatment: SEC-SDLC-002 private intake.
- Owner or decision path: Release-security design and project maintainers.
- Review trigger or deadline: First production release preparation or first credible report, whichever occurs first.
- Risk while deferred: No defined customer notification or supported-version process.

#### Review and supersession triggers

- Release cadence, distribution model, or support commitments change.

### SEC-DATA-001 — Destructive helpers excluded from production code

- Status: Required
- Priority: Medium
- Applicability: Schema compatibility, reset, test, migration, and production packaging
- Delivery horizon: Before production
- Related threats: THR-020, THR-027
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-014`
- Prior requirements: None
- Supersedes: None
- Dependencies: Production package boundary
- Human decision reference: FND-014 ruling, 2026-08-03

#### Normative requirement

Helpers whose purpose or default behavior permits destructive reset, drop/recreate, or migration-gate bypass MUST exist only in test code and MUST NOT be importable or callable from production-shippable code or artifacts. Every shipped schema mutation path MUST retain the authoritative safe-default gate.

#### Rationale

Test-oriented destructive helpers are currently importable from production code and invert the authoritative migration safety default.

#### Implementation flexibility

Tests may retain equivalent fixtures or helpers under test-only modules and packaging boundaries.

#### Verification criteria

1. Production package and container inventories contain no destructive test helper.
2. Import and caller scans show every shipped schema mutation path reaches the safe gate.
3. Tests retain required reset capability without production imports.

#### Operational and failure considerations

- Test packaging must not be enabled by a runtime production flag.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Configuration promotion or new schema tooling.

### SEC-API-002 — API-version security invariants and legacy-read removal

- Status: Required
- Priority: Low
- Applicability: Legacy and versioned public domain routes
- Delivery horizon: Legacy duplicate fetch/search removed before production; target within one week of 2026-08-03
- Related threats: THR-026
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-020`
- Prior requirements: None
- Supersedes: None
- Dependencies: ADR 009; issue #117
- Human decision reference: FND-020 and HDN-006 ruling, 2026-08-03

#### Normative requirement

Duplicate unversioned fetch and search routes MUST be removed now that their parallel-development compatibility need has ended. Existing unversioned create, update, and delete routes MUST remain the canonical write contract until a backward-incompatible contract change justifies a versioned successor under ADR 009; they MUST NOT be copied into v1 solely for numeric symmetry. Authentication and authorization behavior MUST be enforced through shared controls and tested across every remaining route and version.

#### Rationale

Duplicated reads already differ in enrichment behavior, but unchanged writes have no competing version and gain no security from premature copying.

#### Implementation flexibility

Compatibility duration for future major versions remains a release decision under ADR 009; security-invariant tests are mandatory while versions overlap.

#### Verification criteria

1. Legacy duplicate fetch/search routes are absent.
2. Route-inventory tests identify the canonical contract for every operation.
3. Authentication and authorization matrices cover every route and remain semantically consistent.
4. Any future retained deprecated route has a documented removal issue and condition.

#### Operational and failure considerations

- Documentation directs new consumers to versioned contracts where they exist.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Any backward-incompatible write-contract change or new major API version.

### SEC-AUDIT-003 — Domain and system actor identity integrity

- Status: Required
- Priority: Low
- Applicability: Domain attribution fields and non-HTTP writes
- Delivery horizon: Before production
- Related threats: THR-015, THR-017
- Source findings: `20260803T113549Z-f074efdc579f-full-review-de0326/FND-019`, `20260803T113549Z-f074efdc579f-full-review-de0326/FND-007`
- Prior requirements: None
- Supersedes: None
- Dependencies: SEC-AUDIT-001
- Human decision reference: FND-019 ruling, 2026-08-03

#### Normative requirement

Shipped domain defaults MUST NOT name a seeded administrator or shared stub actor. User-attribution fields MUST resolve to the authenticated current actor or require explicit authorized selection. Non-human writes MUST use a distinct system identity or channel that cannot be mistaken for a human administrator.

#### Rationale

The current default extends the stub/admin identity collision into user-facing attribution.

#### Implementation flexibility

Distinct principals, actor-type metadata, or a separately attributable system channel may represent automation.

#### Verification criteria

1. Production class definitions and generated metadata contain no admin/stub attribution constant.
2. Human and system writes are distinguishable in records and security events.
3. Other class-definition attribution defaults are inventoried and tested.

#### Operational and failure considerations

- Missing current actor fails closed rather than selecting an administrator.

#### Deferral terms

Not applicable.

#### Review and supersession triggers

- Worker, event, batch, or customization execution identities.

## 6. Design-input disposition ledger

Run prefix in every source key below is `20260803T113549Z-f074efdc579f-full-review-de0326`.

| Source key | Input type | Disposition | Resulting requirements or decision | Rationale | Human authority | Review trigger |
| --- | --- | --- | --- | --- | --- | --- |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-001` | Finding | Accepted as requirement | SEC-AUTH-001 | Supported Critical path; explicit fail-closed and claim controls selected | Brettski74, 2026-08-03 | Signing or key-topology change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-002` | Finding | Accepted as requirement | SEC-AUTH-002, SEC-OPS-001 | Supported Critical path; known production credentials prohibited | Brettski74, 2026-08-03 | Bootstrap or database-role change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-003` | Finding | Accepted as requirement | SEC-AVAIL-001 | Static resource limits selected; representative load test not an initial gate | Brettski74, 2026-08-03 | Production saturation telemetry |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-004` | Finding | Accepted as requirement | SEC-WEB-002 | Production profile and systemic headers required; no narrowing without raw-response evidence | Brettski74, 2026-08-03 | Deployment or browser-auth change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-005` | Finding | Accepted as requirement | SEC-AUDIT-001; residual risk in section 7 | Bulk-read evidence and limits required; class-wide row access retained | Brettski74, 2026-08-03 | Customer requires record segregation |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-006` | Finding | Accepted as requirement | SEC-AVAIL-002 | Static query budgets selected; regexp retained subject to bounded work | Brettski74, 2026-08-03 | Production saturation telemetry |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-007` | Finding | Accepted as requirement | SEC-AUDIT-001, SEC-AUDIT-002, SEC-OPS-001, SEC-AUDIT-003 | Core events and role/identity controls required; full protected audit deferred | Brettski74, 2026-08-03 | Customer requests SIEM integration |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-008` | Finding | Accepted as requirement | SEC-API-001 | Anonymous surface must match accepted minimal-health constraint | Brettski74, 2026-08-03 | New public endpoint |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-009` | Finding | Accepted as requirement | SEC-SDLC-001 | SBOM/SCA, integrity, and non-root confinement selected as production gate | Brettski74, 2026-08-03 | Build or dependency-topology change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-010` | Finding | Deferred | SEC-SDLC-002, SEC-SDLC-003 | Minimal private intake required; full release-security process deferred to an auditable trigger | Brettski74, 2026-08-03 | First release preparation or credible report |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-011` | Finding | Accepted as requirement | SEC-OPS-001 | Least-privilege runtime and isolated restore-point authority selected | Brettski74, 2026-08-03 | Migration-role design changes |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-012` | Finding | Accepted as requirement | SEC-SESS-001, SEC-SESS-002 | Access revocation required now; refresh-family controls staged before retaining clients | Brettski74, 2026-08-03 | Non-browser refresh client |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-013` | Finding | Accepted as requirement | SEC-WEB-001 | Login CSRF and normalized redirect controls required | Brettski74, 2026-08-03 | Login topology change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-014` | Finding | Accepted as requirement | SEC-DATA-001 | Test helpers must be removed from shippable code | Brettski74, 2026-08-03 | New schema tooling |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-015` | Finding | Accepted as requirement | SEC-AUTHZ-001 | Ordinary target class and attribute read authority selected | Brettski74, 2026-08-03 | Attribute authorization redesign |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-016` | Finding | Accepted as requirement | SEC-OPS-002 | Secret values prohibited from operator output | Brettski74, 2026-08-03 | New operator surface |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-017` | Finding | Validation required | SEC-SESS-003; ADR 010; section 10 | Mandatory SSR proxy rejected; exact browser credential mechanism unresolved | Brettski74, 2026-08-03 | Replacement mechanism design |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-018` | Finding | Accepted as requirement | SEC-AUDIT-001 | Durable deletion event required; hard deletion remains allowed | Brettski74, 2026-08-03 | Record-lifecycle change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-019` | Finding | Accepted as requirement | SEC-AUDIT-003 | Current actor or explicit selection required | Brettski74, 2026-08-03 | New attribution default |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-020` | Finding | Accepted as requirement | SEC-API-002 | Duplicate reads removed; unchanged writes remain unversioned under ADR 009 | Brettski74, 2026-08-03 | New major API version |
| `20260803T113549Z-f074efdc579f-full-review-de0326/FND-021` | Finding | Accepted as requirement | SEC-OPS-003 | Explicit production artifact profile required | Brettski74, 2026-08-03 | Packaging change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-001` | Prior-risk reassessment | Linked to finding disposition | FND-020; SEC-API-002 | Write asymmetry incorporated; old compatibility need has ended for duplicate reads | Brettski74, 2026-08-03 | New major API version |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-002` | Prior-risk reassessment | Linked to finding disposition | FND-011; SEC-OPS-001 | Restore-point caveat no longer justifies shared runtime privilege | Brettski74, 2026-08-03 | Restore design changes |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-003` | Prior-risk reassessment | Linked to finding disposition | FND-015; SEC-AUTHZ-001 | Returned display content is subject to target read authority | Brettski74, 2026-08-03 | Reference policy changes |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-004` | Prior-risk reassessment | Linked to finding disposition | FND-017; ADR 010 | ADR 002 mandatory-hop acceptance reopened and superseded in direction | Brettski74, 2026-08-03 | Replacement mechanism design |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-005` | Prior-risk reassessment | Linked to finding disposition | FND-019; SEC-AUDIT-003 | M1 debt comment does not justify shipping an admin/stub default | Brettski74, 2026-08-03 | New create surface |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-006` | Prior-risk reassessment | Resolved by requirement | SEC-AUTH-001, SEC-AUTH-002, SEC-AVAIL-002, SEC-WEB-002 | Fail-closed intent converted into explicit API, credential, query, and production-profile outcomes | Brettski74, 2026-08-03 | Relevant configuration changes |
| `20260803T113549Z-f074efdc579f-full-review-de0326/PRA-007` | Prior-risk reassessment | Resolved by human decision | Individual FND dispositions in this ledger | No blanket risk acceptance inferred from TM-REV-001 acceptance | Brettski74, 2026-08-03 | Next security-design revision |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-001` | Human decision | Resolved by requirement | SEC-OPS-001 | Non-superuser runtime guaranteed; restore privilege isolated | Brettski74, 2026-08-03 | Migration design changes |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-002` | Human decision | Resolved by requirement | SEC-AUTHZ-001 | Target class and attribute authority governs enrichment | Brettski74, 2026-08-03 | Attribute authorization redesign |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-003` | Human decision | Resolved by requirement | SEC-WEB-002 | THR-009 not narrowed until raw production responses pass | Brettski74, 2026-08-03 | Raw-response validation |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-004` | Human decision | Validation required | SEC-SESS-003; ADR 010; section 10 | Direct browser API direction set; exact mechanism remains open | Brettski74, 2026-08-03 | Replacement mechanism design |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-005` | Human decision | Resolved by requirement | SEC-AUDIT-001 | Durable deletion event required; soft delete not required | Brettski74, 2026-08-03 | Record-lifecycle change |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-006` | Human decision | Resolved by requirement | SEC-API-002 | Remove duplicate reads; do not version unchanged writes | Brettski74, 2026-08-03 | New major API version |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-007` | Human decision | Resolved by human decision | SEC-AVAIL-001, SEC-AVAIL-002 | Static limits sufficient initially; load testing reconsidered on production telemetry pressure | Brettski74, 2026-08-03 | Saturation telemetry |
| `20260803T113549Z-f074efdc579f-full-review-de0326/HDN-008` | Human decision | Resolved by requirement | SEC-SDLC-001 | Authorized SCA/SBOM/provenance validation is a production gate | Brettski74, 2026-08-03 | Every production release |

## 7. Accepted risks

| Source findings | Related threats | Risk accepted | Existing or interim controls | Rationale | Accepted by and date | Review trigger |
| --- | --- | --- | --- | --- | --- | --- |
| FND-005 | THR-011, THR-012 | A class-read grant continues to authorize every row of that class; no record-level segregation is required now | Class RBAC, SEC-AUDIT-001 bulk-read events and volume controls, SEC-AUTHZ-001 reference controls | Record-level authorization is not presently justified as a production blocker; customer segregation needs will supply concrete policy requirements | Brettski74, 2026-08-03 | A customer requires record-level segregation |

## 8. Deferred controls

| Requirement or finding | Reason for deferral | Interim treatment | Owner or decision path | Target or trigger | Residual risk |
| --- | --- | --- | --- | --- | --- |
| SEC-AUDIT-002 / FND-007 | Full protected audit architecture deferred until demanded by an integration | Core durable events and least-privilege roles | Security design and customer-integration refinement | Customer requests SIEM integration | Privileged DB actor can alter app data and app-held evidence |
| SEC-SESS-002 / FND-012 | No current browser client retains refresh tokens | Atomic digest-only rotation; SSR discards refresh tokens | Authentication/session refinement | Before any non-browser client retains refresh tokens | Future replay could sustain an undetected chain if trigger is missed |
| SEC-SDLC-003 / FND-010 | Full release-security process is premature before a production release | Published private intake and response ownership | Release-security design and maintainers | First production release preparation or credible report | No complete advisory/support/notification process |

## 9. Rejected recommendations

None. Some mechanisms remain open, and one residual risk is accepted, but no candidate recommendation was rejected outright.

## 10. Validation-required items

| Source finding or disagreement | Validation needed | Why it blocks disposition | Safe validation path | Owner or decision path |
| --- | --- | --- | --- | --- |
| FND-017 / HDN-004 | Select and threat-model the browser credential mechanism replacing mandatory SSR proxying | Cookie topology, CSRF, SSR data loading, revocation, and deployment routing determine whether SEC-SESS-003 is actually met | Compare JWT-cookie, opaque-session, and other designs against ADR 010 and SEC-SESS-001/003 before implementation | Security design; likely focused ADR follow-up or consolidation |

## 11. Traceability matrix

| Requirement | Threats | Findings | Verification criteria | Suggested refinement targets |
| --- | --- | --- | --- | --- |
| SEC-AUTH-001 | THR-001, THR-006 | FND-001 | Startup and token-negative tests | Issue #67 auth hardening |
| SEC-AUTH-002 | THR-002 | FND-002 | Production bootstrap negative tests | Seed and deployment configuration |
| SEC-AVAIL-001 | THR-003–005 | FND-003 | Input, concurrency, throttle, and responsiveness tests | Issue #33 |
| SEC-AVAIL-002 | THR-012, THR-013 | FND-006 | Query budget and timeout tests | Search resource controls |
| SEC-AUTHZ-001 | THR-011, THR-012, THR-026 | FND-015 | Cross-class authority matrix | Attribute/reference authorization |
| SEC-AUDIT-001 | THR-003, THR-007, THR-012, THR-015, THR-017 | FND-005, FND-007, FND-018 | Event and deletion-survival tests | Core audit event model |
| SEC-AUDIT-002 | THR-014, THR-017 | FND-007 | Protected export and DB-change evidence | SIEM/audit architecture |
| SEC-OPS-001 | THR-002, THR-014, THR-020, THR-021 | FND-002, FND-007, FND-011 | Database role matrix | Database role provisioning |
| SEC-OPS-002 | THR-002, THR-014, THR-017 | FND-016 | Canary-secret output tests | CLI redaction |
| SEC-SESS-001 | THR-006 | FND-001, FND-012 | Revocation and lifetime tests | Issue #67 |
| SEC-SESS-002 | THR-007 | FND-012 | Refresh replay sequence tests | Non-browser auth clients |
| SEC-WEB-001 | THR-008 | FND-013 | Origin and redirect corpus tests | Login integrity |
| SEC-WEB-002 | THR-009, THR-023 | FND-004 | Raw production response capture | Production security profile |
| SEC-SESS-003 | THR-024, THR-028 | FND-017 | Browser credential threat model and integration tests | Browser/API auth design |
| SEC-API-001 | THR-016 | FND-008 | Anonymous route and error inventory | API production profile |
| SEC-OPS-003 | THR-016 | FND-021 | Production artifact inventories | Build/deployment profiles |
| SEC-SDLC-001 | THR-021, THR-024 | FND-009 | SBOM/SCA and runtime confinement | Release gate |
| SEC-SDLC-002 | THR-022 | FND-010 | Private-report tabletop | SECURITY policy/intake |
| SEC-SDLC-003 | THR-022 | FND-010 | Advisory-response tabletop | Release-security process |
| SEC-DATA-001 | THR-020, THR-027 | FND-014 | Package, import, and caller inventories | Schema test-helper isolation |
| SEC-API-002 | THR-026 | FND-020 | Route and auth/authz matrices | Issue #117 |
| SEC-AUDIT-003 | THR-015, THR-017 | FND-007, FND-019 | Actor/default inventory | System actor design |

## 12. Architecture conflicts and decisions

| Security requirement or finding | Conflicting architecture intent | Human ruling | ADR, if required | Resolution status |
| --- | --- | --- | --- | --- |
| SEC-SESS-003 / FND-017 | ADR 002 permanently requires browser API traffic through SSR | Direct browser-to-API calls are required while credentials remain inaccessible to JavaScript; exact mechanism remains validation-required | `architecture/decisions/010-browser-direct-api-auth.md` | Direction resolved; mechanism open |

## 13. Implementation refinement handoff

| Requirement group | Requirement IDs | Existing or suggested issue | Dependencies | Refinement emphasis |
| --- | --- | --- | --- | --- |
| Authentication and sessions | SEC-AUTH-001, SEC-SESS-001, SEC-SESS-002 | Existing #67 plus scoped follow-ups | Browser auth design | Preserve live permission checks |
| Bootstrap and DB privilege | SEC-AUTH-002, SEC-OPS-001, SEC-OPS-002 | Suggested credential/role hardening issues | Deployment role provisioning | Fail before mutation; no shared privileged runtime |
| Availability | SEC-AVAIL-001, SEC-AVAIL-002 | Existing #33 plus search-budget issue | Telemetry/event support | Static bounds first; telemetry review |
| Authorization and audit | SEC-AUTHZ-001, SEC-AUDIT-001, SEC-AUDIT-002, SEC-AUDIT-003 | Suggested reference-auth and audit-foundation issues | Stable actor model | Cross-surface enforcement and durable events |
| Browser and API security | SEC-WEB-001, SEC-WEB-002, SEC-SESS-003, SEC-API-001 | Suggested production-profile and browser-auth design issues | ADR 010 validation | Raw-response and CSRF verification |
| Release and artifacts | SEC-OPS-003, SEC-SDLC-001, SEC-SDLC-002, SEC-SDLC-003 | Suggested production-profile, release-gate, and disclosure issues | Release ownership | Deterministic inventories and tabletop |
| Schema and API cleanup | SEC-DATA-001, SEC-API-002 | Existing #117 plus schema-helper isolation | ADR 009 | Remove duplicated reads; keep unchanged writes canonical |

## 14. Open human decisions

| Related requirement or finding | Decision needed | Options or tradeoff | Consequence of delay |
| --- | --- | --- | --- |
| SEC-SESS-003 / FND-017 | Exact browser credential and routing mechanism | JWT cookie, opaque session, or another design; balance SSR rendering, CSRF, revocation, and process blast radius | Existing SSR proxy remains current implementation and direct browser API work cannot be accepted |

An Accepted document may contain explicit open decisions only when they do not make active requirements contradictory or ambiguous.

## 15. Revision history

| Revision | Date | Status | Source runs or trigger | Author or agent | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| SREQ-REV-001 | 2026-08-03 | Accepted | Initial design from run `20260803T113549Z-f074efdc579f-full-review-de0326` | GPT-5.6 Sol primary agent; model-tier verification waived | Accepted 2026-08-03 by Brettski74 |

## 16. Completion

Design-input disposition counts:

- Accepted as requirement: 19
- Covered by existing requirement: 0
- Mitigated by verified existing control: 0
- Deferred: 1
- Accepted risk: 0 finding-level dispositions; 1 explicit residual risk
- Rejected: 0
- Validation required: 1 finding-level disposition
- Standalone linked or resolved inputs: 13
- Standalone validation-required inputs: 2
- FND inputs: 21
- DSG inputs: 0
- PRA inputs: 7
- HDN inputs: 8
- Total source inputs: 36
- Accounted source inputs: 36
- Unaccounted source inputs: 0

Requirement counts:

- Required: 19
- Deferred: 3
- Superseded: 0
- Retired: 0

Completion checks:

- [x] Threat model and review inputs match pinned commits and hashes.
- [x] Every run-qualified FND, DSG, PRA, and HDN source key has exactly one disposition.
- [x] Every requirement has stable traceability to threats, findings, or a human decision.
- [x] Every active requirement is normative, scoped, and verifiable.
- [x] Every deferral has interim treatment and a review trigger.
- [x] Every accepted risk remains visible with rationale and a review trigger.
- [x] Every rejection preserves rationale and reconsideration conditions.
- [x] Every unresolved disagreement or validation need remains explicit.
- [x] Cross-architecture conflicts have a human ruling and ADR where required.
- [x] No finding is silently treated as accepted implementation authority.
- [x] Unaccounted source inputs equal zero.
- [x] Summary tables match authoritative detailed records.

Set the document header to `Status: Accepted` only after explicit human acceptance and commit authorization, updating all acceptance metadata and the current revision-history row together.
