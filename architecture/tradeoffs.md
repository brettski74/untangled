# Tradeoffs

Known compromises and the reasoning behind them.

> Claims are **inferred** unless marked **confirmed**. Do not record short-lived milestone delivery limits here.

## Modular monolith vs microservices

- **Choice:** modular monolith with strict internal boundaries first.
- **Why:** avoid premature distributed complexity; keep consistency and a single deploy story while boundaries stay enforceable.
- **Cost:** later extraction of workers/event processors will need deliberate cuts along those boundaries.
- *(inferred, high — AGENTS §3.1)*

## Thin mapping + generated validators vs heavy ORM

- **Choice:** convention-based mapping and visible SQL; Pydantic/Zod for **persisted** class/record shapes **generated from YAML**, never hand-coded. Operation protocol models (HTTP envelopes, query/body contracts) may be hand-authored.
- **Why:** single YAML intent for persisted validation across Python and JS; operations can define protocol without inventing YAML for every non-persisted wire shape.
- **Cost:** more explicit persistence patterns; less automatic relationship loading; reviewers must distinguish protocol models from persisted domain models.
- *(confirmed)*

## Identifier-compatible naming vs parallel kebab identity

- **Choice:** require identifier-compatible spelling for any name that is or may be an identifier in shipped languages; standardize former kebab identifier surfaces on `snake_case`; leave pure display/data unconstrained by that rule.
- **Why:** one mental model for code-facing names without pretending every string in the product must be snake; avoids a second orthography for YAML identifiers that embed in SQL/API/expressions.
- **Cost:** authors must distinguish identifier fields from display/data; cutover already landed with epic #150.
- *(confirmed)*

## YAML class definitions as schema source of truth vs migration history

- **Choice:** YAML definitions drive intent; migrate computes plans from definitions vs live DB.
- **Why:** Git-friendly intent; plans are history of apply, not a competing truth.
- **Cost:** operators must understand “intent then derive,” not “edit migration files as primary.”
- *(inferred, high — docs/class-definitions.md)*

## `create-default` as migrate backfill vs permanent COLUMN DEFAULT

- **Choice:** reuse `create-default` for required AddColumn backfill via temporary DEFAULT + DROP DEFAULT in one transaction; no lasting table default; no separate `migrate-default` key for now.
- **Why:** one literal for create and historical fill; general facility without per-class migrate hacks; desired schema stays free of hidden DB defaults.
- **Cost:** authors committing `create-default` on a required attribute also commit to backfilling all existing rows on add; large-table ADD DEFAULT may lock/rewrite; optional→required tighten still open (#62).
- *(confirmed)*

## UUIDv7 vs sequential or UUIDv4 IDs

- **Choice:** UUIDv7 everywhere for PKs.
- **Why:** global uniqueness across environments, Git-safe workflows, better index locality than v4.
- **Cost:** larger keys than integers; tooling must handle UUID strings consistently.
- *(inferred, high — AGENTS §3.5)*

## Auth + RBAC on every endpoint vs open exploration APIs

- **Choice:** require authentication on all endpoints (optional minimal health check); enforce RBAC on endpoints.
- **Why:** enterprise security posture; avoid dual paths and late lock-down risk.
- **Cost:** clients and `/docs` must obtain and present credentials.
- *(confirmed)*

## Class `public` vs seeding universal `{class}:read`

- **Choice:** optional class metadata `public` grants authenticated read without a role-catalog `{class}:read` row; still not anonymous; upcoming attribute-level read requirements can still deny individual fields.
- **Why:** “readable by every signed-in user” must not depend on every role remembering a grant; avoids per-class router bypasses.
- **Cost:** org-wide authenticated bulk read for that class at the **class** grain (same class-wide row model as ordinary read), subject to attribute-level overrides when those land; YAML that sets `public: true` is an authorization change — class tiering remains the intended bound on who may alter such metadata (#116 / ASM-021, not implemented here).
- *(confirmed)*

## Interim SSR-proxied browser auth vs direct browser→API

- **Target choice:** JWT session/access credentials; direct browser→API without application-level SSR proxy; credentials remain JS-inaccessible; browser calls use **same-origin relative** `/api/...` paths; API authenticates browser requests; CSRF/origin/cookie-scope required; minimize SSR signing authority and plaintext auth material; live authz via DB/cache (**#162**), not permissions stuffed in the JWT.
- **Interim choice:** `httpOnly` session cookie on the web tier; SSR loaders/actions attach `Authorization: Bearer`; browser never reads the credential; browser does not call the API directly.
- **Why (target):** avoid long-term handler duplication and credential concentration in SSR; same-origin keeps cookie auth simple as services split; JWT + asymmetric verify supports future auth/service extraction without embedding authz in the token.
- **Why (interim):** early-stage workaround until cookie/CSRF packaging and (optionally) a local same-origin edge exist.
- **Cost:** interim hop accrues technical and security debt; any credential still sent to SSR stays in its compromise boundary; dual auth modes must stay authorization-aligned until the interim path is retired.
- *(confirmed)*

## Single public origin vs split browser ports

- **Choice:** credentialed browser traffic assumes one public origin (customer perimeter in prod; optional compose edge for dev/non-prod). Internal multi-port URLs stay server-side only.
- **Why:** HttpOnly JWT cookies and CSRF are straightforward on one origin; publishing `:8000` / future microservice ports to the browser forces CORS and brittle cookie scope as the mesh grows.
- **Cost:** local default compose may keep split published ports until an optional edge profile lands; engineers exercising browser→API may need that profile or a temporary same-origin shim — not a licence to design permanent dual-origin credentialed clients.
- *(confirmed)*

## AGPL core vs customization outside copyleft

- **Choice:** AGPL for core; explicit carve-out so tenant-specific customizations (often confidential) are not treated as AGPL’d core.
- **Why:** open core without forcing customers’ business logic into licence disputes.
- **Cost:** boundary must be legally precise (addendum **#26**); YAML/JS alone is insufficient because core uses both.
- *(confirmed intent; legal text open on #26)*

## Intentional migrate/seed vs auto-apply on compose up

- **Choice:** compose bring-up does not migrate or seed; operators apply migrate/seed deliberately.
- **Why:** schema apply is consequential; keep it explicit.
- **Cost:** extra steps for new environments; footgun if forgotten.
- *(inferred, high — README)*

## Own 400/422 classification vs framework defaults

- **Choice:** classify client errors by structural (400) vs semantic (422) meaning; reclassify framework output when it disagrees.
- **Why:** clients and operators need a stable, intentional contract; FastAPI/Pydantic often map many structural failures to 422.
- **Cost:** explicit error-mapping layer and tests; cannot treat framework status codes as authoritative.
- *(confirmed — #56)*

## Path-based API majors vs header/query versioning

- **Choice:** version public domain HTTP APIs in the path (`/api/v{major}/...`); per-major factories composing shared modules; coherence groups move together; record paths use live class `name` without pluralization from v2 onward; sparse boarding onto a new major during deprecation; retire a major only as a whole platform surface.
- **Why:** versions stay explicit in links, logs, routing, and docs; shared domain logic without branched mega-factories; integrators get a coherent “leave `/api/vN` entirely” story instead of eternal per-endpoint skew; path identity stays aligned with class `name`.
- **Cost:** catch-up mounts before retirement; parallel majors and tests during windows; pre-production may briefly tolerate an undesirable `N+2` under flux (collapse before production). Epic #150’s one-time shortened retention is closed history, not a standing waiver.
- *(confirmed)*

## Podman-first Compose selection vs Docker-only defaults

- **Choice:** support Podman and Docker; when `COMPOSE` is unset, auto-select with Podman preferred over Docker; keep explicit `COMPOSE` override.
- **Why:** bare `make up` on Rocky/RHEL-class Podman-only hosts; dual-engine machines follow team/ops default without forcing every operator to set `COMPOSE`.
- **Cost:** dual-engine hosts get Podman by default (Docker-first workflows need an explicit override or docs); capability probes must drive wait/readiness, not binary name alone.
- *(confirmed)*
