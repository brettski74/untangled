# Unknowns

Unresolved questions, risks, and open architectural gaps.

> Prefer promoting settled answers into `constraints.md` / `principles.md` / `decisions/` — not leaving them only in chat. Do not encode short-lived milestone delivery limits here.

## Open

| ID | Question | Why it matters | Confidence it is still open |
| -- | -------- | -------------- | --------------------------- |
| U1 | Exact sandbox for JS customization (V8 isolate product/API, isolation model, host bridges) | Safe extensibility invariant | high |
| U2 | Internal event bus shape (in-process vs broker; delivery guarantees; idempotency) | Modular monolith + future workers | high |
| U3 | Customization-driven schema changes (customer-added attributes/classes/FKs) without assuming only engineers ship DDL | Config-as-code at enterprise scale | high |
| U4 | Metadata-driven dynamic schema (beyond system tables + YAML class defs) — timing and model | AGENTS data-layer roadmap | medium |
| U5 | CMDB class model and standards alignment | Large design surface for enterprise CI counts | high |
| U6 | Git-backed config engine + Draft → Review → Publish UX for non-Git users | First-class Git integration not yet built | high |
| U7 | Environment promotion / validation / rollback mechanics | Multi-env portability | medium |
| U8 | Full search predicate model (OR, ranges, contains, relative dates, etc.) | API consistency as predicates grow | medium |
| U9 | Cookie/CSRF attribute validation for JWT browser auth, optional compose **edge** packaging for local same-origin, and how/when default local compose adopts it — JWT-as-mechanism and same-origin browser `/api` paths are decided (see `constraints.md`); production perimeter TLS stays customer-owned | Finish direct browser→API without dual-origin debt; interim SSR proxy remains until then | high |
| U10 | When/how workers and event processors split from the API process | Horizontal scaling claim | medium |
| U11 | Legal text of the AGPL customization boundary / licence addendum | Confirmed intent; customers need enforceable clarity | high — tracked as **#26** |

## Closed during seed

| ID | Resolution |
| -- | ---------- |
| (product framing) | Enterprise-grade ITSM, not “developer-grade” / toy — see `principles.md` |
| (auth posture) | Auth required on all endpoints except optional minimal health check; RBAC enforced — see `constraints.md` |
| (browser credentials) | JWT; direct browser→API; same-origin relative `/api`; live authz (#162 / security); interim SSR hop is debt; cookie/CSRF/edge packaging still U9 — see `constraints.md` / `tradeoffs.md` |
| (public origin) | Single public origin for credentialed browser traffic; customer owns prod perimeter; optional dev/non-prod edge; no review gate on missing local proxy yet — see `constraints.md` |
| (compose engine) | Podman or Docker; Podman-first auto-select when `COMPOSE` unset; explicit override wins — see `constraints.md` / `tradeoffs.md` |
| (class public) | Optional class `public` = authenticated class read without `{class}:read`; attribute-level read perms (soon) override `public`/class read; `admin` all-access — see `constraints.md` / `tradeoffs.md` |
| (create-default migrate) | Required AddColumn uses `create-default` as temporary backfill then DROP DEFAULT; no lasting COLUMN DEFAULT — see `constraints.md` / `tradeoffs.md` |
| (snake identifiers) | Identifier-compatible form for code-facing names; standardized snake surfaces enumerated; display/data free; derivatives follow class name without extra validators — see `constraints.md` / `boundaries.md` / `tradeoffs.md` |
| (record navigation) | Record opens use real app-route hyperlinks, not JS-only navigate or API URLs — see `constraints.md` |
| (attribute order) | Data layouts default to class-definition declaration order; name-only pickers default to lex by label; both overridable by future layout config — see `constraints.md` |
| (shell context bar) | Context bar mounts only via portal into one layout host; no handle/`useMatches` delivery path — see `constraints.md` |
| (record editor undo) | Record editors use app-owned undo scoped to the form subtree; Ctrl/Cmd+S is page-level Save — see `constraints.md` |
| (datetime chrome) | Date + 24-hour time dual controls product-wide (detail any mode); dense non-editable list cells may stay plain text — see `constraints.md` |
| (API path versioning) | `/api/v{major}`; per-major factories; coherence groups; path = live class `name` (v2+, no pluralization); sparse N+1 OK / N+2 undesirable pre-prod / avoid N+3; retire whole major; #150 retention exception closed — see `constraints.md` / `tradeoffs.md` |
| (FK naming) | `<object>_id` / `<prefix>_<object>_id`; user FKs usually `<actioned>_by` — see `constraints.md` |
| (validators) | Persisted Pydantic/Zod generated from YAML; protocol/API models may be hand-authored — see `constraints.md` |
| (architecture access) | Only architect skills may read/write `/architecture/` — see `constraints.md` / `boundaries.md` |
