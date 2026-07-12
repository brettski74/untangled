# Milestone 1 — Vertical slice: INC + CHG with auth, RBAC, and shell UI

> **Temporary document.** This file is a working reference for planning and executing Milestone 1 only. Commit it once agreed so the team (and agents) can follow it through M1. **Delete `TODO.md` when M1 is complete.** It must not linger as an authoritative source for later milestones; if it is still present after M1, treat it as historical and do not use it to drive new work.

## Goal

Ship a thin, containerized vertical slice of Untangled ITSM: convention-based object mapping (Python + JavaScript), token-based authentication with role-based access control, an SSR shell UI (collapsible left nav, list + detail content panes), and two operational ticket types — **Incident (INC)** and **Change Request (CHG)** — with create, search, view, and persist. No workflows, no CMDB, no Git-backed config engine, no customization runtime.

Success looks like: a developer can `docker compose up`, sign in, see only nav sections they can access, create/search/open INC and CHG records, and have those records stored in PostgreSQL with UUIDv7 primary keys, audit fields, and friendly operational IDs.

---

## First-class M1 elements (not gaps)

These are in-scope building blocks, not afterthoughts.

### User identity model

First-class `User` (and the join tables needed for roles/permissions). Auth and RBAC hang off this; tickets assume a current user for audit fields and “Assigned to Me”-style filters.

### Schema migrations

Explicit migration tooling and a compose-friendly apply path so schema changes are shared and repeatable.

**Future tension (acknowledge now, fully design later):** customization will eventually add attributes, classes, and relationships — i.e. table, index, foreign-key, and check-constraint changes from customer config as well as from core product releases. M1 only needs a solid core-product migration story; the customization-driven schema path is a later design problem, but migrations must not paint us into a corner that assumes “only engineers ship DDL.”

### Audit fields (every persisted domain/config object that we care to track)

From day one (names subject to final naming-convention pass in refinement):

- `created_at`
- `last_updated` (or equivalent snake_case final name)
- `created_by_user` (FK to user)
- `last_update_user` (FK to user)

### API conventions (M1 search)

Standardized search as a set of **predicates** combined with **AND** only for M1.

- A predicate = field + operation + one or more values.
- M1 operations: **equals**, **not-equals** only.
- Later: OR combining; gt/lt/between; contains; pattern match; empty/null checks; starts/ends with; smart/relative dates (e.g. last 24 hours, next week).

Basic create / fetch / update (and delete if included) are separate from the search surface — see ticket split below. Consistent error shapes remain in scope; exact URL/payload shapes are refinement detail.

### Authentication (token-based — not HTTP Basic on every call)

Username/password is used **only at login** to obtain tokens. API calls use short-lived access tokens (e.g. `Authorization: Bearer …`). A longer-lived refresh token is used to mint new access tokens without re-sending the password.

Rationale: shipping “Basic Auth on every request” trains clients to hold and replay passwords and makes a later token/OIDC migration a broad, painful cutover. A simple access + refresh design is still “unsophisticated” compared to SSO/MFA, but it matches the shape we will keep.

**HTTPS:** not required for M1 local/dev. Prefer designs that work over HTTP in compose and can require HTTPS later in deployed environments without an auth rewrite. (Production should eventually require HTTPS; that is a deploy/config change, not an M1 blocker.)

**Password hashing:** use a well-recognized adaptive password hashing scheme (e.g. Argon2id or bcrypt via a maintained library). Choice is a refinement item; inventing a custom scheme is not allowed.

**Off-the-shelf direction (refine to pick one):** OAuth2-style password login that issues JWT (or opaque) access tokens + rotating refresh tokens, implemented with maintained FastAPI/security libraries — not a hand-rolled crypto protocol. Full OIDC/SSO IdP integration remains later.

### How we exercise the API before the UI exists

Until the shell/list/detail UI lands (tickets 9–10), human exploration is via FastAPI `/docs`: JSON in, JSON out. That is intentional.

**With auth enforced (the plan), the loop is:**

1. Call the login endpoint with username/password (seed users from ticket 5).
2. Receive a **short-lived access token** and a **longer-lived refresh token** (names/shapes are refinement detail).
3. In Swagger UI, use **Authorize** and supply the access token as a Bearer credential. Subsequent Try-it-out calls include `Authorization: Bearer …` automatically for that docs session — you do **not** paste it onto every request by hand.
4. When the access token expires, call the refresh endpoint with the refresh token, get a new access token, update Authorize once.

The browser does **not** magically attach Bearer tokens unless we also set cookies. For `/docs` and generic API clients, **explicit Bearer via Authorize** is the straightforward path. The SSR app (later) may store the refresh token in an httpOnly cookie and/or hold the access token in memory — refinement detail. Cookies are a delivery mechanism, not a different security model.

That refresh friction is real but small (tens of seconds per access-token lifetime). It is not worth a temporary “open API” mode.

### Auth / RBAC timing vs domain APIs

**Build auth early; enforce as soon as protected resources exist.**

We considered “implement early, enforce late” (open domain APIs until the UI wire-up) for `/docs` convenience. **Rejecting that:** it forces fake audit-user behaviour (nullable FKs or a hard-coded seed user on every write), dual code paths, and a late big-bang “remember to lock the routes” risk — all to avoid a short Authorize click. Not worth it.

Agreed model:

- Tickets **5–6** — user identity, login/refresh, roles/permissions, seeds. Auth endpoints work; document the `/docs` Authorize flow.
- Tickets **7–8** — INC/CHG CRUD and search **require** a valid access token; stamp `created_by_user` / `last_update_user` from the authenticated principal; apply RBAC on class+operation (and `admin`). Exercise via `/docs` with Authorize.
- Tickets **9–10** — UI chrome and screens (may mock until wired).
- Ticket **11** — UI login/session + call protected APIs; nav/actions respect permissions. **Enforcement is already on;** this ticket is integration, not “flip the auth switch.”

### Dev bootstrap / seed data (folded into functional tickets)

No standalone “seed everything” ticket. Seed as each capability appears:

| When | Seed |
| ---- | ---- |
| Ticket **5** | At least three users: **admin** (will hold `admin`), **read-only**, **read-write** (non-admin). Passwords documented for local compose. |
| Ticket **6** | Baseline roles/permissions; attach users to roles (admin / read-only / read-write as above). |
| Ticket **7** | A few sample INC and CHG records so list/detail and `/docs` fetch have something to show. |

Compose-up after these tickets should already be exercisable for the pieces built so far.

### Frontend: SSR, not a SPA

The UI must be server-rendered (SSR). A client-only SPA is out of scope for the default architecture. ISR (Incremental Static Regeneration) is a poor fit for a per-user, auth-gated operational app — prefer request-time SSR (and client interactivity where needed), not statically regenerated pages.

Stack choice is part of scaffolding (ticket 1); see discussion notes below for candidates.

**Tickets 9–10** are the first real INC/CHG UI. Before that, backend-only via `/docs`.

---

## Parked for later (explicitly not M1)

- Git-backed configuration / Draft → Review → Publish
- Sandboxed JS customization runtime / event bus
- Customization-driven DDL (tables/indexes/FKs/checks from customer config) — design later; keep migrations extensible
- Configurable layout / filter engines (hard-code layouts and a small set of nav filters for M1)
- Kubernetes manifests as a deliverable (compose only; keep images K8s-friendly)
- SSO / OIDC IdP / MFA (token shape now; federation later)
- Workflows, SLAs, notifications, attachments, activity streams
- CMDB / Asset / Event product areas (omit empty nav stubs)
- Requiring HTTPS in all environments

### Future milestone note — global quick search (not M1)

Postpone friendly-ID fast-path and omnibox search until after basic create/view/list works (likely M2+).

Intended direction: a thin top toolbar (single row height) with a small search field near the top-right. If the string looks like a ticket id (`INC…` / `CHG…`), resolve and open that record in detail view on match. If it does not look like a ticket id, run text search across relevant classes and present per-class match counts; the user drills into a list view for a chosen class. Useful, but deliberately deferred.

---

## Frontend stack candidates (decide in ticket 1)

Constraint: **SSR-first**, authenticated app, form/list/detail heavy; **not** a pure SPA; **ISR not preferred**.

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **React Router v7 (framework / Remix lineage)** | SSR-first; loaders/actions fit CRUD forms and mutations well; progressive enhancement; less “accidental SPA” than Next defaults | Smaller ecosystem than Next; team must be happy with RR conventions |
| **Next.js (App Router)** | Huge ecosystem, hiring familiarity, solid React tooling; can SSR per request | Easy to drift into client-heavy SPA patterns; ISR features are a distraction to avoid for this product |
| **SvelteKit** | Excellent SSR defaults, small bundles, clean data-loading story | Smaller ecosystem/hiring pool; another mental model if the team is React-centric |
| **Nuxt (Vue)** | Strong SSR story if we prefer Vue | Diverges from React-centric JS ecosystem assumptions; Zod/React examples elsewhere won’t map 1:1 |
| **Server templates + HTMX (e.g. Jinja from FastAPI)** | Truly multi-page, minimal JS, very simple ops | Weaker fit long-term for a dense interactive operational shell; splits UI logic away from the JS class/Zod side of the house |

**Lean recommendation for discussion:** prefer an **SSR framework with first-class form/navigation primitives** (React Router v7/Remix-style, or SvelteKit) over a client-routed SPA. Next.js is fine if we discipline ourselves to request-time SSR and avoid ISR/static assumptions for authenticated routes. HTMX is attractive for speed-to-first-screen but may fight the long-term JS model layer.

---

## Open questions (per-ticket refinement — not blocking this plan)

- Exact minimal field sets for Incident and Change Request.
- Whether INC↔CHG related tabs are real FKs in M1 or empty placeholder tabs.
- Where friendly-ID pad length and prefixes live (env, DB config table, YAML file).
- How nav filter criteria are declared in M1 (hard-coded constants vs simple config files).
- Final username model (email vs opaque login name).
- Exact token formats (JWT vs opaque), refresh rotation, and storage (Bearer-only vs httpOnly cookies for the SSR app) — pick a maintained pattern in the auth ticket.
- Final frontend stack among the candidates above.

---

## Proposed ticket order

Order is dependency-first: foundations → auth/RBAC → protected domain APIs → UI → wire UI to auth. Tickets can be split further during refinement if any one looks too large.

| # | Proposed title | Intent |
| - | -------------- | ------ |
| 1 | **Repo & stack scaffolding** | Monorepo layout; Python/FastAPI backend skeleton; **chosen SSR frontend** skeleton; lint/test entrypoints; containers-first local-dev docs. |
| 2 | **Docker Compose runtime (db + api + web)** | Containerize PostgreSQL, backend, and frontend; one-command bring-up; healthchecks; DB volume; images kept reasonable for a later K8s move. HTTP is fine for local compose. |
| 3 | **Convention-based mapping layer (Python + JS)** | Thin table↔class and column↔attribute mapping per AGENTS.md; UUIDv7 PKs; Zod + Pydantic alignment; audit field conventions baked into the base model story. |
| 4 | **Schema migrations baseline** | Migration tool + compose apply path; ready for domain tables; documented assumption that customization-driven DDL is a future concern. |
| 5 | **User identity + token auth** | User model; login → refresh + access tokens; well-known password hashing; document `/docs` Authorize flow. **Seed** the three baseline users. |
| 6 | **RBAC: roles, permissions, enforcement helpers** | Multi-role users; permissions primarily class+operation (CRUD) plus non-class permissions; `admin` grants all; reusable check helpers ready for route guards. **Seed** roles/permissions and attach the three users. |
| 7 | **Incident & Change Request: schema + basic API** | Minimal INC/CHG schemas with audit fields and UUID PKs; friendly IDs on create; create / fetch-by-id / update (delete if in scope). **Auth required;** audit fields from current user; RBAC on operations. **Seed** sample INC/CHG rows (as a privileged/seed path or via authenticated setup). Exercise via `/docs` + Authorize. No predicate search yet. |
| 8 | **Predicate search API** | Standardized search: predicates with eq/neq, AND-only combining; wired for INC and CHG; **auth + RBAC required** (read). |
| 9 | **Shell UI layout (collapsible nav)** | SSR app chrome; collapsible left nav; sections per class; Create New / Search / common filters. First real UI chrome — may mock data until 10–11. |
| 10 | **List view + detail view (hard-coded)** | List: one row per object → detail; detail: 2–3 column simple fields, full-width long text, tabbed related lists (hard-coded INC/CHG layouts). First real ticket screens. |
| 11 | **Wire UI to API (login + permissions)** | UI login/refresh handling; call already-protected APIs; nav/actions respect permissions; end-to-end create → list/search → open → update as an authenticated user. |

### Why friendly IDs are not their own ticket

Friendly IDs are small relative to a high-level feature ticket: a per-class (or global) sequence, format `PREFIX` + zero-pad to configured width, assign on insert, expose on the record. The only mildly interesting bits are concurrency-safe allocation and where the width/prefix config lives — both fit naturally inside “create an Incident/Change.” Keeping them as a separate M1 epic overstated the work; they ship as part of ticket **7**.

---

## Suggested dependency sketch

```text
1 Scaffolding
    └─► 2 Compose runtime
            └─► 4 Migrations ──┐
3 Mapping layer ───────────────┴─► 5 User + token auth (+ seed users)
                                      └─► 6 RBAC helpers (+ seed roles)
                                              │
                                              ▼
                                    7 INC/CHG schema + CRUD + friendly IDs
                                              │  (auth enforced; /docs + Authorize)
                                              ▼
                                    8 Predicate search API (auth enforced)
                                              │
                         9 Shell UI ─► 10 List/Detail UI
                                              │
                                    11 Wire UI login ↔ protected APIs
```

Tickets **3** and **2** can proceed in parallel after **1**. Ticket **9** can start once the frontend skeleton exists, using mocks until **7**/**10**/**11**.

---

## Explicitly out of scope for this milestone

- Workflows, approvals, state machines beyond simple status fields if included
- Git-backed config, promotion, sandbox customization runtime
- Kubernetes manifests as a deliverable (compose only; stay compatible)
- SSO / OIDC federation / MFA
- HTTP Basic Auth as the ongoing API credential
- Global omnibox / friendly-ID quick-open search (see future note above)
- CMDB, Discovery, Event Management product areas
- Configurable UI/layout engine
- Attachments, email inbound/outbound, notifications
- Mandatory HTTPS in local/dev
- A standalone end-of-milestone seed ticket (seeds ride with 5 / 6 / 7)

---

## Next steps (after this doc is agreed)

1. Review and adjust ticket list / order in this file.
2. Commit `TODO.md` as the M1 reference (temporary; delete when M1 completes).
3. Create corresponding GitHub issues (titles + short stubs only).
4. Refine issues one-by-one via the refine workflow (`.refinement/`) before implementation.
