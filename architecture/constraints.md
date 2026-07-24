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
- Naming: SQL/Python/JSON/JS = `snake_case`; YAML = `kebab-case`; classes = PascalCase. *(inferred, high — AGENTS §3.7)*
- Relationships:
  - Explicit FKs: `<object>_id`, or `<prefix>_<object>_id` when a table has multiple FKs to the same target (prefix names the role, e.g. `next_<object>_id` / `previous_<object>_id`). *(confirmed)*
  - User FKs are usually `<actioned>_by` (e.g. system fields `created_by`, `updated_by`). *(confirmed)*
  - M2M via first-class join tables with their own UUID PKs. *(inferred, high — AGENTS §3.8)*
- Large fields: rely on PostgreSQL TOAST initially (no manual LOB splitting). *(inferred, high — AGENTS §3.4)*

## Authentication & authorization

- Authentication is required on **all** HTTP endpoints, except optionally a health check that returns only a running/alive flag (no other data). *(confirmed)*
- Endpoints must **enforce RBAC**. Auth and RBAC are already implemented building blocks; new surfaces must use them. *(confirmed)*

## Configuration & serialization

- Human-authored schema/config: YAML. System/UI/API structured payloads: JSON. *(inferred, high — AGENTS §4.1)*
- Persisted JSON (Git/exports): pretty-printed, stable key order, deterministic. Runtime API JSON: accept any valid JSON; do not pretty-print unless requested. *(inferred, high — AGENTS §4.2)*

## Deployment & process

- Containerized (Docker); Kubernetes for orchestration when scaling. *(inferred, high — AGENTS §3.11)*
- Horizontally scalable: API, workers, event processors (when introduced). *(inferred, high)*
- Config promotion across environments with validation and rollback. *(inferred, high — AGENTS §3.10)*

## Intent-store governance

- **Only** architect skills may read or write `/architecture/` (or anything under it). **All** other skills — including but not limited to refine / implement / verify — must not. *(confirmed)*

## Anti-goals (must not)

- Slow down from feature bloat; fragment models; force repeated user input; hide critical logic in opaque automation; default to microservices early; depend on heavy ORMs. *(inferred, high — AGENTS §8)*
- Frame the product as a developer toy or “developer-grade” plaything. *(confirmed — see principles)*
