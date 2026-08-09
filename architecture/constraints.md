# Constraints

Hard rules that must not be violated.

> Claims are **inferred** unless marked **confirmed** by the human architect.

## Technology stack

| Area | Constraint | Source |
| ---- | ---------- | ------ |
| Backend | Python + FastAPI (or equivalent) | inferred, high — AGENTS §3.2 |
| Customization runtime | Sandboxed JavaScript (V8 isolate or equivalent) | inferred, high — AGENTS §3.3 |
| Database | PostgreSQL primary store | inferred, high — AGENTS §3.4 |
| Frontend (current) | React Router v7 SSR in `frontend/` | inferred, high — README / docs |
| Core product license | AGPL; dependencies AGPL-compatible (prefer MIT/BSD/PostgreSQL) | inferred, high — AGENTS §7; see licensing boundary below |

## Licensing boundary

- Core product is AGPL. *(confirmed)*
- Customer/business-specific customizations must have a **clear boundary outside AGPL copyleft**, so tenants need not fear that confidential commercial logic becomes entangled in AGPL compliance disputes. *(confirmed)*
- Customizations are expected to be YAML configuration, JavaScript, or both — but core also ships YAML and JavaScript, so **language alone does not delineate** core vs customization. *(confirmed)*
- Exact legal delineation: open work tracked as **#26** (licence addendum). Until that lands, treat the boundary as an invariant intent, not a finished legal artifact. *(confirmed pointer)*

## Data & identity

- Primary keys: **UUIDv7**, PostgreSQL `uuid`, exposed as hyphenated strings. *(confirmed, high — AGENTS §3.5)*
- No traditional heavy ORM; thin convention-based mapping; SQL stays visible. *(confirmed, high — AGENTS §3.6)*
- **Persisted domain shapes:** Pydantic and Zod models for database-backed class/record fields are **generated from YAML class definitions — never hand-coded.** *(confirmed)*
- **Operation protocol:** Hand-authored Pydantic/Zod (or equivalent) models are allowed for HTTP/API operation contracts — request/response envelopes, query/body protocols, and other non-persisted wire shapes that are not YAML class definitions. *(confirmed)*
- **Naming — identifier-compatible form:** Any string that is or may reasonably be used as an identifier in code or code-like expressions must use a form compatible with identifier syntax in the languages we ship (Python, JavaScript, SQL, JSON, YAML). That is the rule that applies **everywhere**; it is not “make everything `snake_case`.” Where product surfaces previously used kebab-case for such names, they are **standardized on `snake_case`**, matching contexts that already used snake. Language/runtime type names remain PascalCase (already identifier-compatible). *(confirmed)*
- **Naming — standardized on `snake_case`:** class `name`; attribute map keys; well-known substitution tokens; closed functional vocabularies such as attribute `type` and search `op` tokens; product YAML **structural keys** (e.g. `display_name`, `check_constraint`, `nav_bar`); and other in-scope functional-identifier fields under the rule above. Class-definition **filenames** follow class `name` by equivalence with that identifier, not a separate filename law. Derivatives that embed class identity (e.g. FK target identity, permission key class segments) follow the class `name` spelling as a **consequence** — do not invent extra validation layers solely for those derivatives. Loaders/validators **fail closed** on non-conforming structural keys and in-scope functional-identifier fields (no dual-accept window). *(confirmed)*
- **Naming — pure data / display are not forced to snake:** human-readable display label *values*, nav list URL slugs derived from display labels, domain record field *values* that are user/domain data (unless later reclassified as closed system vocabularies), **role `name` values** (data — optional seed snake cleanup allowed; do not validate as snake), and general nav **data values** (not structural keys). Class-reference fields in nav follow class `name` identity. Non-product paths (Git branches, ADR filenames, skill paths) are out of scope. Kebab-case remains allowed for pure data/display when chosen. *(confirmed)*
- Relationships:
  - Explicit FKs: `<object>_id`, or `<prefix>_<object>_id` when a table has multiple FKs to the same target (prefix names the role, e.g. `next_<object>_id` / `previous_<object>_id`). *(confirmed)*
  - User FKs are usually `<actioned>_by` (e.g. system fields `created_by`, `updated_by`). *(confirmed)*
  - M2M via first-class join tables with their own UUID PKs. *(inferred, high — AGENTS §3.8)*
- Large fields: rely on PostgreSQL TOAST initially (no manual LOB splitting). *(inferred, high — AGENTS §3.4)*
- **`create-default` dual role:** for **required** attribute adds, `create-default` is both create-path / API create default **and** migrate add-time backfill. Plan `ADD COLUMN … NOT NULL DEFAULT <literal>` then `DROP DEFAULT` in the **same** migrate transaction so steady-state column identity stays `(name, type, nullable)` with **no** lasting PostgreSQL COLUMN DEFAULT. Required AddColumn without `create-default`: empty tables OK; non-empty tables fail (no invented silent backfill). Optional (`NULL`) adds do not need a default for this rule. Temporary DEFAULT is add-op metadata, not durable desired-schema equality. Prefer this DDL path over NULLABLE→DML→SET NOT NULL while MigrationOp stays DDL-only. Facility is **general** across classes — not one-off table special cases. Optional→required tighten on an existing nullable column remains a separate residual (#62) unless decided later. *(confirmed)*

## Authentication & authorization

- Authentication is required on **all** HTTP endpoints, except optionally a health check that returns only a running/alive flag (no other data). *(confirmed)*
- Endpoints must **enforce RBAC**. Auth and RBAC are already implemented building blocks; new surfaces must use them. *(confirmed)*
- **Class `public` (authenticated read):** a class definition may set optional `public` (default `false`). When true, any **authenticated** caller may **read** (fetch, search, list, reference-read, and equivalent reads) without `{class}:read`. Unauthenticated callers stay denied — not anonymous access; does not enlarge the minimal anonymous surface. Create/update/delete and other non-reads stay `{class}:{op}` or `admin`. Enforcement lives in shared permission helpers (and matching frontend read gating); no per-route flag-only control and no class-name special cases. Not a seed/RBAC catalog grant. Ordinary **class-level** read authority is `{class}:read` **or** `admin` **or** class `public` (enrichment and other class read gates must use the same rule). Only classes whose full corpus is appropriate for org-wide authenticated read should set the flag. *(confirmed)*
- **Attribute-level permissions (imminent):** finer grants that require a specific permission to **read** (or otherwise access) a particular attribute **override** class-level read and `public` for that attribute — holding class read / `public` is not enough when the attribute demands its own permission. `admin` remains an all-access pass. Detail of the attribute-permission model lands with that work; this note only records the override relationship so `public` is not read as “every field visible to every authenticated user.” *(confirmed)*
- **Session/access credentials are JWTs.** Browser delivery keeps them **inaccessible to JavaScript** (`HttpOnly` / `Secure` as applicable — no `localStorage` / `sessionStorage` / non-`httpOnly` cookie / inlined or hydration exposure). Non-browser clients may present Bearer JWTs. Claim contents, signing/verify topology, and revocation bounds are owned by durable **security intent** (not restated here). *(confirmed)*
- **Authorization is live, not JWT-embedded:** permission grants resolve from current account/role state (DB, with cache such as Redis per **#162**), not from a stale permission set inside the access token. Prompt effect of authz changes is an implementation/security concern tracked there and in SEC-SESS-* — not duplicated as claim rules in this file. *(confirmed pointer)*
- **Target topology:** browser-originated API calls reach the API **without** an application-level SSR proxy, while credentials stay JS-inaccessible. The API authenticates those browser requests itself. Authorization semantics stay aligned across browser-cookie and Bearer modes. *(confirmed)*
- **Browser API URLs are same-origin relative** to the public app origin (e.g. `/api/v{major}/...`). Do not publish internal multi-port or multi-host service addresses to the browser for credentialed calls. Internal service base URLs (Compose DNS, future service names) are **server-only** configuration (e.g. SSR → API). *(confirmed)*
- Browser auth design must include **CSRF** protection, restrictive origin handling, and cookie scope appropriate to deployment topology; `httpOnly` alone is not sufficient for cookie-authenticated unsafe requests. Remaining cookie-attribute / CSRF validation detail stays with security intent and U9. *(confirmed)*
- SSR must **not** hold credential-signing authority merely to support browser sessions. Minimize credentials and plaintext authentication material exposed by an SSR compromise; any credential also delivered to SSR remains in that compromise boundary and must be justified. *(confirmed)*
- An SSR hop that attaches Bearer server-side is an **interim** pattern only; it is **not** standing permanent topology. Existing interim implementation may remain while direct browser→API is built; new work must not deepen reliance on mandatory SSR proxying as the long-term design. *(confirmed)*

## Operator UI — record navigation

- Opening a **domain record’s detail URL** in operator UI must use a real HTML hyperlink (`<a href="…">`, or a framework link that renders one with a real `href`) — system-wide (friendly-id cells, FK cells, lists, related lists, and equivalent affordances). *(confirmed)*
- Links must support ordinary browser behaviour (bookmark, copy link, open in new tab/window, middle-click, keyboard activation). Imperative navigate / click handlers **without** a meaningful `href` are non-conformant for record opens. *(confirmed)*
- Href targets are **SSR app routes**, not domain API URLs. *(confirmed)*
- Non-navigation controls (Execute, Refresh, sort, pagination, menus) remain buttons or other appropriate widgets. *(confirmed)*

## Operator UI — shell context bar

- The authenticated shell context-bar strip has **one** mount contract: portal into a single layout host (occupancy provider). Do not deliver this strip via `handle.render_context_bar`, `useMatches`-selected handle renderers, or any second parallel mount. *(confirmed)*
- Layout host stays visible for authenticated chrome (inert decorative strip when empty; portal target when a route opts in). *(confirmed)*
- Page-local interactive state that must share with the destination body stays on the route via the portal API — do not lift it into layout solely to feed chrome. *(confirmed)*
- Single occupant (deepest/leaf); nested dual occupancy fails closed. Occupied labelling is destination-agnostic (e.g. “Context bar”). React Router `handle` may still carry unrelated route metadata. *(confirmed)*

## Operator UI — record editors (undo / save)

Scoped to **record editors** over controlled fields (detail, new-record, and later record-editing surfaces) — not a shell-wide keyboard policy. *(confirmed)*

- The editor owns an **app-level undo stack** of chunks over its draft. Ctrl/Cmd+Z always means “pop a chunk” in that editor — never a mix of native per-field undo and application undo. *(confirmed)*
- Undo handling is limited to the editor’s form subtree (or editor-owned controls), including suppressing browser default on an empty stack. Shell chrome (omnibox, context bar, list chrome, etc.) keeps **native** undo. No document- or window-level undo handler from a record editor. *(confirmed)*
- Contiguous edits to the same focused field merge into one chunk; a new chunk starts when focus/edit target changes. Exhausting the stack returns the draft to baseline (clean). *(confirmed)*
- Successful save and explicit user refresh clear the undo buffer and reset baseline — no undo across a persisted write. *(confirmed)*
- Ctrl/Cmd+S is **page-level Save** (same path as the Save control), registered only while the principal may write; intentional asymmetry with undo scoping. *(confirmed)*
- Without applicable write permission the editor is read-only and registers neither undo nor save shortcuts; the API remains authority on the write. Read-only may apply to the **whole record** or to **individual fields**, as defined by permissions (today: class-level write plus fields that are inherently non-editable such as standard audit attributes; soon: finer custom class/field view and update grants). Undo/save policy still applies only where the editor may write. *(confirmed)*
- Out of scope for this policy (neither required nor forbidden here): redo; optimistic concurrency / lost-update protection; unsaved-navigation guards. Full field-level authorization model is owned elsewhere — this section only notes that editor chrome must respect field- as well as record-scoped read-only. *(confirmed pointer)*

## Operator UI — datetime controls

- Editable datetime controls product-wide, and detail-form datetime in **both** editable and read-only modes, use **native date picker + 24-hour time text** dual-control chrome. Do not use a plain ISO (or similar) single text field, `datetime-local`, or third-party date/time pickers for those surfaces. *(confirmed)*
- Reference models: detail read-only dual chrome; list quick-filter / filter-editor editable date + time pairs. New work matches that pattern rather than inventing a parallel widget family. *(confirmed)*
- **Exception:** dense, **non-editable** list-cell (or equivalent plain text) display may remain compact local datetime text. That exception does not justify wrong chrome on editable controls or on detail-form datetime in any mode. *(confirmed)*
- Record-editor undo/save and partial/invalid intermediate input stay inside the existing editor contract — they do not license a divergent datetime widget family. *(confirmed)*

## Configuration & serialization

- Human-authored schema/config: YAML. System/UI/API structured payloads: JSON. *(inferred, high — AGENTS §4.1)*
- Persisted JSON (Git/exports): pretty-printed, stable key order, deterministic. Runtime API JSON: accept any valid JSON; do not pretty-print unless requested. *(inferred, high — AGENTS §4.2)*
- **Attribute ordering — two defaults by context:**
  - Where attributes are laid out **with their data** (forms, list columns, and equivalent presentations), class-definition **declaration order is the default** presentation order so related fields can group and importance can lead. Reordering attributes in a definition is a deliberate, reviewable product change. *(confirmed)*
  - Where the UI shows a **list of attribute names only** (pull-downs and similar name pickers, without the attribute values), options are sorted **lexicographically by display label by default** (case-insensitive unless a surface documents otherwise) for findability. That is not a carve-out from declaration-order layout; it is a different context. *(confirmed)*
- Tooling (formatters, canonicalizers, export/promotion, merge helpers) must **preserve** class-definition attribute-map order and must never alphabetize those maps. “Stable key ordering” means deterministic, not sorted, for attribute maps in definitions. *(confirmed)*
- Generated field meta carries an explicit ordinal per attribute; data-layout consumers order by that ordinal by default. Missing ordinal → fail closed (no invented alphabetical/insertion fallback for layout). *(confirmed)*
- Both rules are **defaults**, not locks: a future explicit layout/view (or similar) configuration may override presentation order for a given view or control. Do not read this constraint as forbidding deliberate administrator/user layout configuration. Do not add a competing per-attribute display-order key on the class definition itself as a second default mechanism. *(confirmed)*

## HTTP client-error status codes

Distinguish **structural** vs **semantic** request failures. Do not rely on framework defaults when they blur that line. *(confirmed — #56)*

- **400 Bad Request** — structural issues with the request, including:
  - JSON parsing failure
  - Missing mandatory attributes
  - Unrecognized attributes
  - Wrong data shape (e.g. object vs array)
- **422 Unprocessable Entity** — semantic issues with request data that is otherwise well-formed, including:
  - Failed value constraints (ranges, formats, enums)
  - Cross-field validation failures (e.g. only one of two fields allowed; attribute mandatory when another is set; incompatible values across attributes)
  - Domain rule failures
  - Invalid data type for a field (e.g. non-numeric value for a numeric field)
- Where a framework emits the wrong code (e.g. FastAPI/Pydantic treating structural problems as 422), **capture and reclassify** before returning the response. *(confirmed — #56)*

## Public HTTP API versioning

- Public domain HTTP APIs use major path versions: `/api/v{major}/...`. Operational endpoints such as `/health` and `/` are exempt. *(confirmed)*
- `/api/v1` is the first versioned contract. Existing **unversioned** routes are pre-versioning **legacy**; they are not retrospectively v1. *(confirmed)*
- Prefer **additive, backward-compatible** change inside the current major. A backward-incompatible request or response change opens (or boards) a new major. *(confirmed)*
- **Coherence groups** share a major and move together — do not split a group across majors. At minimum: the generated class **record** surface (search / get / create / update / delete and FK enrichment for that mount style) is one group; the **auth session** suite (login / refresh / logout / me and equivalents) is another; other hand-authored domains define their own groups. *(confirmed)*
- **Record collection path segments (from `/api/v2` onward):** path segments that encode class identity use the live class `name` directly — **no pluralization**. Orthography tracks live `name`, not a frozen alternate spelling. *(confirmed)*
- **Per-major factories (standing rule):** each API major has its own versioned factory (or equivalent entry module) that **composes shared** persistence, authz, mapping, and handlers. Do **not** use long-lived multi-version conditionals (`surface=`-style) in one factory as the versioning mechanism. Prefer short-term duplication of wiring over branched mega-factories. The same delete-friendly factoring applies to **versioned code generators** where they exist. Retiring a major is **unmount + delete that version’s module**. *(confirmed)*
- **Sparse majors during deprecation:** opening major `N+1` may mount only what must change (plus its coherence group); unchanged groups may remain on `N` temporarily. Catch-up mounts of unchanged contracts onto the newer major are expected before retirement — same shared handlers, new version module. *(confirmed)*
- **Parallel-major budget (pre-production):** sparse `N+1` alongside current `N` is OK; sparse `N+2` is **undesirable but allowed** while the product is still in major flux; sparse `N+3` (three steps ahead / four majors in play) is **to be avoided**. Collapse toward at most current + one deprecated major **before production**; drop the `N+2` allowance as part of that hardening. *(confirmed)*
- **Platform-major retirement:** when major `N` is removed, **all** public domain routes under `/api/vN` go together — no orphan endpoints left on `N` while others live only on newer majors. The linked follow-up issue tracks **retire major N** (inventory catch-ups), not “delete three routes and leave the rest of `N` forever.” *(confirmed)*
- **Closed epic exception:** epic #150 used a one-time shortened previous-major retention window to finish identity/path cutover; that exception is **closed** with the epic and does **not** authorise future tickets to skip ordinary retention, linked removal issues, documented deprecation, or same-major breaking renames for endorsed contracts without a new human ruling. *(confirmed)*
- Every new public domain endpoint, and every existing public domain endpoint whose contract changes, must land on a versioned path. Docs steer new consumers to the **current** major and label remaining unversioned routes as legacy. *(confirmed)*
- When a deprecated major is retained for compatibility, create a **linked follow-up removal issue** so cleanup is tracked (not only comments or memory). *(confirmed)*

## Deployment & process

- **Containerized** OCI workloads; Kubernetes for orchestration when scaling. Compose bring-up may use **Podman or Docker**. *(confirmed)*
- **Compose engine selection** (Makefile and documented ops bring-up; reuse for later start/shutdown scripts): when `COMPOSE` is unset, prefer the first **usable** entrypoint — (1) `podman compose`, (2) `podman-compose`, (3) `docker compose`, (4) `docker-compose` (legacy last resort). “Usable” means a successful version/capability probe, not mere `PATH` presence. Wait/readiness follows engine capability. Explicit `COMPOSE` override always wins (including CI pins). Docker remains fully supported via fallback or override. This does not change Compose service definitions or require Podman/Kubernetes as the sole production orchestrator. *(confirmed)*
- Horizontally scalable: API, workers, event processors (when introduced). *(inferred, high)*
- Config promotion across environments with validation and rollback. *(inferred, high — AGENTS §3.10)*
- **Single public origin (direction):** customer-facing deployments present one public HTTPS origin with path routing to app services (e.g. `/` → web, `/api` → API). TLS termination and perimeter controls are **customer-owned** (their reverse proxy / Ingress / CDN). The product does **not** require shipping Untangled’s own perimeter proxy in production; customers may front or replace any reference edge. *(confirmed)*
- **Optional compose edge:** a product-provided reverse-proxy / path-routing profile for **dev and non-prod** convenience (same-origin + optional local TLS) is desirable intent, not a current hard requirement. Default local compose without that edge is allowed while browser→API is interim/unimplemented. *(confirmed)*
- **Review non-goal:** architecture / change-review must **not** treat “no reverse proxy in local compose” as a violation while the interim SSR hop remains. Flag work that deepens permanent dual-origin browser API designs, publishes internal service URLs to the browser for credentialed calls, or blocks the single-origin target. *(confirmed)*

## Intent-store governance

- **Only** architect skills may read or write `/architecture/` (or anything under it). **All** other skills — including but not limited to refine / implement / verify — must not. *(confirmed)*

## Anti-goals (must not)

- Slow down from feature bloat; fragment models; force repeated user input; hide critical logic in opaque automation; default to microservices early; depend on heavy ORMs. *(inferred, high — AGENTS §8)*
- Frame the product as a developer toy or “developer-grade” plaything. *(confirmed — see principles)*
