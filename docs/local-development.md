# Local development

Untangled is **containers-first**: `make up` brings up PostgreSQL, the API, and the web app via Docker Compose.

For iterative coding with hot reload, use `make backend-dev` / `make frontend-dev` on the host (with `make db-up` if you need Postgres). Those are not required for the Compose runtime.

Schema apply and baseline seed are **intentional**: after `make up`, run `make migrate` then `make seed`. Neither runs automatically on Compose start.

Published GHCR images (optional; not used by default Compose `build:`) and GitHub Actions product CI are documented in [container-images.md](./container-images.md).

## Prerequisites

- Docker with Compose v2 (`docker compose`) — required for `make up` and DB-backed tests
- GNU Make
- Python 3.12+ and Node.js 20+ — only needed for host-side `make install`, lint/test, and `*-dev` targets

## First-time setup

From the repository root:

```bash
make up
make migrate   # apply YAML schema intent (Postgres must be reachable)
make seed      # idempotent baseline users + RBAC (roles/permissions/attachments)
```

That builds images and starts **postgres**, **api**, and **web**, waiting until healthchecks pass, reconciles the database to `backend/class-definitions/`, then upserts the local seed users, RBAC attachments, and sample Incident / Change Request rows.

For host-side lint/test tooling:

```bash
make install
```

Default DB connection from the **host** (override with `DATABASE_URL`):

```text
postgresql://untangled:untangled@127.0.0.1:5432/untangled
```

Inside the **api** container, Compose sets `DATABASE_URL` to use the `postgres` service hostname.

## Auth (local)

| Setting | Default (Compose / docs) |
| ------- | ------------------------ |
| `UNTANGLED_JWT_SECRET` | `local-dev-only-change-me-untangled-jwt-secret` (dev only) |
| `UNTANGLED_ACCESS_TOKEN_TTL_SECONDS` | `900` (15 minutes) |
| `UNTANGLED_REFRESH_TOKEN_TTL_SECONDS` | `604800` (7 days) |
| `UNTANGLED_SESSION_SECRET` | `local-dev-only-change-me-untangled-session-secret` (web cookie signing; **required**, no in-code default) |
| `UNTANGLED_COOKIE_SECURE` | `false` for plain-HTTP local (must set explicitly; unset defaults to Secure); `true` behind HTTPS |
| `UNTANGLED_API_BASE_URL` | Compose web: `http://api:8000`; host `make frontend-dev`: `http://127.0.0.1:8000` |
| `UNTANGLED_DEFINITIONS_DIR` | Optional. Absolute path to YAML class-definitions for unusual layouts only; Compose uses `/app/class-definitions` via the image WORKDIR (do not set this for normal local Compose). |

Seed users (usernames are case-normalized to lowercase):

| Username | Default password | Stable UUID | Role |
| -------- | ---------------- | ----------- | ---- |
| `admin` | `admin-change-me` | `01900000-0000-7000-8000-000000000001` | `admin` (permission `admin` = allow-all) |
| `readonly` | `readonly-change-me` | `01900000-0000-7000-8000-000000000002` | `read-only` (`{class}:read`) |
| `readwrite` | `readwrite-change-me` | `01900000-0000-7000-8000-000000000003` | `read-write` (create/read/update; **no** `:delete`, **no** `admin`) |
| `change` | `change-change-me` | `01900000-0000-7000-8000-000000000004` | `change-request-read-write` (CHG create/read/update only) |
| `incident` | `incident-change-me` | `01900000-0000-7000-8000-000000000005` | `incident-read-only` (`incident:read` only) |

Override passwords with `SEED_ADMIN_PASSWORD`, `SEED_READONLY_PASSWORD`, `SEED_READWRITE_PASSWORD`, `SEED_CHANGE_PASSWORD`, `SEED_INCIDENT_PASSWORD` when running `make seed`.

### Permission keys

- Class+operation: `{class}:{operation}` where `class` is the YAML class `name` (kebab-case) and `operation` is one of `create`, `read`, `update`, `delete`. Example: `demo-item:read`.
- For M1, `read` covers list, fetch-by-id, and search.
- Non-class key in M1: `admin` — grants all access in enforcement helpers.
- Seeded catalog includes full CRUD keys for `demo-item`, `incident`, and `change-request` (including `:delete` rows). Pre-seeding `incident` / `change-request` permission **rows** does not create those domain tables.
- Effective permissions are the **union** across all roles assigned to a user. Resolution is from the database per request (not JWT claims).

### Roles (stable seed UUIDs)

| Role `name` | UUID | Permissions |
| ----------- | ---- | ----------- |
| `admin` | `01900000-0000-7000-8000-000000000011` | `admin` |
| `read-only` | `01900000-0000-7000-8000-000000000012` | `{class}:read` for seeded classes |
| `read-write` | `01900000-0000-7000-8000-000000000013` | `{class}:create`, `:read`, `:update` for seeded classes |
| `change-request-read-write` | `01900000-0000-7000-8000-000000000014` | `change-request:create`, `:read`, `:update` |
| `incident-read-only` | `01900000-0000-7000-8000-000000000015` | `incident:read` |

### Enforcement helpers (for later domain routes)

Use FastAPI dependencies from `untangled.rbac`:

```python
from typing import Annotated, Any

from fastapi import Depends

from untangled.rbac import require_class_operation, require_permission

@router.get("/incidents")
def list_incidents(
    _user: Annotated[dict[str, Any], Depends(require_class_operation("incident", "read"))],
):
    ...

@router.delete("/incidents/{id}")
def delete_incident(
    _user: Annotated[dict[str, Any], Depends(require_permission("incident:delete"))],
):
    ...
```

Authenticated but unauthorized → **403**. Missing/invalid Bearer → **401**.

### UI login (SSR gate)

Local-dev convention: after `make up` + `make migrate` + `make seed`, open `http://127.0.0.1:5173` and sign in with a seed user (`admin` / `readonly` / `readwrite` / `change` / `incident` and their default passwords above).

- Unauthenticated routes redirect to `/login` (fail-closed).
- Login calls `POST /auth/login` from the web tier; only the **access** JWT is stored in an httpOnly session cookie (refresh discarded until #14).
- The authenticated layout loads `GET /auth/me` once per navigation tree; the header user chip uses display name (hover = username). Real RBAC permissions still come from `/auth/me` for later YAML nav (#66).
- Access expiry / API **401** clears the cookie and returns to login; **403** keeps the session. Token refresh is #14; YAML nav destinations are #66; broader auth security review is #67.

Cookie posture (ADR 002): `httpOnly`, `sameSite=lax` (CSRF defence for same-origin authenticated SSR form actions), `secure` on by default with explicit local opt-out, cookie `maxAge` derived from the access JWT `exp` claim. The JWT is never exposed to browser JavaScript. Login-form CSRF and broader hardening are tracked in #67.

### `/docs` Authorize loop

1. Open `http://127.0.0.1:8000/docs`.
2. `POST /auth/login` (OAuth2 password form) with a seed username/password — copy `access_token`.
3. Click **Authorize**, paste the access token as Bearer, then Try-it-out on `GET /auth/me` (roles + effective permission keys).
4. Hit `GET /auth/rbac-probe` (requires `demo-item:read` or `admin`). Seed users with broad class read (`admin` / `readonly` / `readwrite`) succeed; `change` / `incident` (no `demo-item:read`) get **403**; a user with no roles gets **403**.
5. Exercise Incident / Change Request CRUD (after `make migrate` + `make seed`):
   - Prefer versioned reads: `GET /api/v1/incidents/{locator}` /
     `GET /api/v1/change-requests/{locator}` (UUID or friendly number).
   - Legacy (deprecated) scalar reads: `GET /incidents/{locator}` /
     `GET /change-requests/{locator}`.
   - `POST` create (omit `number` — server assigns it), `PATCH` update, `DELETE`
     (admin only among seed roles) on **unversioned** routes.
   - Junk locators → **422**; missing records → **404**; readonly cannot create → **403**.
6. Exercise predicate search (same Authorize token; requires `{class}:read`):
   - Prefer `POST /api/v1/incidents/search` and
     `POST /api/v1/change-requests/search` (see [Predicate search](#predicate-search)
     and [API versioning](#api-versioning) below).
   - Legacy `POST /incidents/search` / `POST /change-requests/search` remain for
     compatibility (scalar FK UUIDs).
   - Omit `predicate` or set it to `null` to match all rows (still paginated / sorted / projected).
   - Empty matches → **200** with `items: []`, `total: 0` (never **404**).
7. When the access token expires (~15m), `POST /auth/refresh` with the refresh token, then Authorize again with the new access token.
8. `POST /auth/logout` with the refresh token to revoke it.

### API versioning

Public domain API versions are **path-based**: `/api/v{major}/…`.

- `/api/v1` is the first versioned contract. Existing unversioned
  `/{collection}/…` fetch and search routes are **pre-versioning legacy**
  compatibility surfaces — they are not retrospectively called v1.
- Every new public domain endpoint, and every existing public domain endpoint
  whose contract is changed, must have an API-version path. Operational
  endpoints such as `/health` and `/` are exempt.
- Backward-incompatible request/response changes increment the major path
  version and leave the previous version available for a documented
  compatibility period.
- Versioned reads in M1: `GET /api/v1/{collection}/{locator}` and
  `POST /api/v1/{collection}/search`. Create/update/delete/auth are not
  bulk-copied under `/api/v1`.
- Removal of the legacy unversioned fetch/search routes is tracked by
  [#117](https://github.com/brettski74/untangled/issues/117).

#### Versioned FK identity (v1 reads)

On `/api/v1` fetch and search responses, each projected foreign-key field
(including audit `created_by` / `updated_by`) is either JSON `null` or:

```json
{
  "id": "01901234-5678-7abc-89ab-cdef01234567",
  "display_name": "Alex Taylor",
  "friendly_id": "USR00000042"
}
```

Rules:

- `id` is always present for a non-null FK (canonical hyphenated UUID).
- `display_name` is included only when the target class has an effective
  `display-attribute`; value may be string or `null`.
- `friendly_id` is included only when the target class defines a `friendly-id`
  attribute; value may be string or `null`.
- Unsupported keys are omitted (not emitted as null).
- Non-FK UUID attributes remain scalar UUID strings.
- Search predicates, sort attributes, and create/update bodies continue to use
  **scalar UUID** values for FK fields.

### Predicate search

Generic, definition-driven search for any class mounted via the class router factory. First wired collections: Incident and Change Request.

| Method | Path | Permission |
| ------ | ---- | ---------- |
| `POST` | `/api/v1/{collection}/search` | `{class}:read` (preferred for new consumers) |
| `POST` | `/{collection}/search` | `{class}:read` (legacy scalar FK responses; deprecated) |

Examples: `POST /api/v1/incidents/search`, `POST /api/v1/change-requests/search`.
Legacy: `POST /incidents/search`, `POST /change-requests/search`.

#### Request envelope

| Field | Required | Rules |
| ----- | -------- | ----- |
| `predicate` | no | Omit or `null` → match all rows. Otherwise a single predicate tree root (below). |
| `sort` | no | Array of `{ "attribute", "direction" }` where `direction` is exactly `asc` or `desc` (case-sensitive). `direction` defaults to `asc` if omitted or `null` (nullable in the schema). Default `[]` (stability suffix only). Bad direction or unknown sort attribute → **422**. |
| `attributes` | no | Snake_case names to include **in addition to `id`**. Omit or `[]` → `{ "id": … }` only. Unknown names → **422**. Duplicates ignored (first wins). |
| `limit` | no | Default **20**, maximum **200**. Outside 1..200 → **422**. |
| `offset` | no | Default **0**. Negative → **422**. |

#### Predicate grammar (delivered)

Every node has an `op` (kebab-case string values). Logical nodes:

| `op` | Children | Meaning |
| ---- | -------- | ------- |
| `and` | `predicates`: non-empty array | All children match |
| `or` | `predicates`: non-empty array | Any child matches |
| `not` | `predicate`: one child | Negation |

Comparison nodes use `attribute` (snake_case, same names as create/fetch bodies and system fields):

| `op` | Extra | Meaning |
| ---- | ----- | ------- |
| `eq` | `value` (required, non-null) | Equals |
| `ne` | `value` (required, non-null) | Not equals |
| `gt` | `value` (required, non-null) | Greater than |
| `gte` | `value` (required, non-null) | Greater than or equal |
| `lt` | `value` (required, non-null) | Less than |
| `lte` | `value` (required, non-null) | Less than or equal |
| `contains` | `value` (required, string) | Substring match (`LIKE`, case-sensitive) |
| `starts-with` | `value` (required, string) | Prefix match (`LIKE`, case-sensitive) |
| `ends-with` | `value` (required, string) | Suffix match (`LIKE`, case-sensitive) |
| `regexp` | `value` (required, string) | POSIX regex match (`~`, case-sensitive) |
| `empty` | *(none)* | `IS NULL` |
| `not-empty` | *(none)* | `IS NOT NULL` |

- `eq` / `ne` / `empty` / `not-empty` apply to **all** mapped attribute types (including system fields).
- `gt` / `gte` / `lt` / `lte` apply to ordered types: **text-family** types
  (`compact-text`, `choice`, `status`, `text`, `multiline-text`, and deprecated
  `string`), plus **`integer`**, **`float`**, **`decimal`**, **`datetime`**,
  **`friendly-id`**. **Not** `boolean` or `uuid` (including FK uuid attributes)
  → **422**.
- `contains` / `starts-with` / `ends-with` / `regexp` apply to the **text
  family** and **`friendly-id`**. Other types → **422**.
  **Note:** `multiline-text` keeps the same operator eligibility as short text
  for M1 consistency; pattern/ordered filters on long bodies may scan heavily
  and are tracked as follow-on performance debt (predicate model / U8).
- Text comparisons are **case-sensitive**. No trim; no implicit casting across incompatible types.
- **Ordered text filters** (`gt` / `gte` / `lt` / `lte` on text-family /
  `friendly-id`) use PostgreSQL `COLLATE "C"` (byte/codepoint order) so results
  are deterministic across database locales. Non-ASCII codepoints sort after all
  ASCII. This is not the same as Unicode locale ordering.
- **Text `sort` collation** still uses the database default (may disagree with C-ordered filters in the same request). Aligning sort with filter collation and case-insensitive search is deferred ([#61](https://github.com/brettski74/untangled/issues/61)).
- **NULL and ordered / equality ops:** rows with a NULL attribute do not match `eq` / `ne` / `gt` / `gte` / `lt` / `lte` (SQL three-valued logic). `lt X` and `gte X` therefore do **not** partition the table. Optional booleans are tri-state: unset (`NULL`) matches neither `eq true` nor `eq false` — use `empty` / `not-empty`, or prefer required booleans once schema defaults/backfill exist ([#62](https://github.com/brettski74/untangled/issues/62)). Use `empty` / `not-empty` for null checks — `value: null` on value-taking ops → **422**.
- **`risk_score` (Change Request):** optional integer; M1 seed/docs convention is **0–100** (not yet range-validated by the API).
- **Friendly-id ordered compares** are lexicographic on the stored text (prefix + digits). With consistent prefixes and pad width this usually tracks numeric order; pad-width differences dominate (e.g. `INC10` sorts before `INC9` if those were the literal stored values without zero-padding).
- LIKE pattern ops treat `%`, `_`, and `\` in the search value as **literals** (escaped; SQL uses `ESCAPE '\'`).
- Unknown `op`, unknown `attribute`, wrong value type, invalid typed values, or invalid `regexp` pattern → **422**.
- Existing envelope `limit` / `offset` caps still bound all search queries (including ordered predicates).
- Pathological regex or leading-wildcard `LIKE` can be expensive at scale; M1 treats that as a client foot-gun (no dedicated timeout/length cap in this slice).

#### Sort stability

1. Apply caller `sort` entries in order.
2. Unless `created_at` already appears, append `{ "attribute": "created_at", "direction": "desc" }`.
3. Unless `id` already appears, append `{ "attribute": "id", "direction": "desc" }`.

#### Response

```json
{
  "items": [{ "id": "…", "number": "INC00000001", "status": "new" }],
  "limit": 20,
  "offset": 0,
  "total": 123
}
```

`total` is the match count before limit/offset. Each item always includes `id`; other fields only if requested via `attributes`.

#### Hard-coded nesting guardrails (M1)

| Constant | Value | Effect |
| -------- | ----- | ------ |
| `max-search-nesting-depth` | 3 | Root at depth 1; children of logical nodes increment depth. Exceed → **422**. |
| `max-search-nesting-length` | 50 | Max children in any one `predicates` array. Exceed → **422**. |

Configurable system parameters for these limits are deferred.

Search client-input failures: container shape, unexpected keys, missing required fields/children, and JSON parse failures → **400**; values, ranges, enums, typed-field mismatches, and domain rules → **422**. Framework (FastAPI/Pydantic) validation is reclassified at the app level using the same taxonomy.

#### Example

```json
{
  "predicate": {
    "op": "and",
    "predicates": [
      { "op": "eq", "attribute": "status", "value": "new" },
      { "op": "ne", "attribute": "severity", "value": "Low" }
    ]
  },
  "sort": [{ "attribute": "status", "direction": "asc" }],
  "attributes": ["number", "summary", "status"],
  "limit": 20,
  "offset": 0
}
```

### Seed tickets (environment-local numbers)

After a fresh migrate + seed, sample rows use **stable UUIDs** (safe for docs / fetch-by-id). Friendly `number` values come from PostgreSQL sequences and may differ after a DB reset — they are **not** portable across environments.

| Class | Stable seed UUID | Typical first number on a fresh DB |
| ----- | ---------------- | ---------------------------------- |
| Incident | `01900000-0000-7000-8000-000000000021` … `026` | `INC00000001` … |
| Change Request | `01900000-0000-7000-8000-000000000031` … `039`, `040` … `044` | `CHG00000001` … |

Six incident rows and fourteen change-request rows are seeded; full stable UUID constants live in `backend/src/untangled/seed/tickets.py`.

`GET /health` and `/docs` stay public. There is no “auth disabled” mode.

## Common commands

| Command | Purpose |
| ------- | ------- |
| `make` or `make help` | List targets with one-line descriptions |
| `make up` | Build and start postgres + api + web via Compose (does **not** migrate or seed) |
| `make down` | Stop the Compose stack (keeps the named DB volume) |
| `make reinstall` | Wipe named DB volume, then `up` → `migrate` → `seed` (add `WITH_HOST_INSTALL=1` to also run `make install`) |
| `make reinstall-keep-data` | Same as `reinstall` but keeps the Postgres volume (`make down` only) |
| `make db-up` | Start PostgreSQL only (for host-run tests / persistence) |
| `make db-down` | Stop the Compose PostgreSQL service |
| `make db-wait` | Wait until PostgreSQL accepts connections |
| `make migrate` | Apply YAML schema intent via production CLI (`python -m untangled.schema`) |
| `make seed` | Idempotent seed of baseline users + RBAC + sample INC/CHG (`python -m untangled.seed`) |
| `make backend-dev` | Run FastAPI with reload on the host (port 8000) |
| `make frontend-dev` | Run React Router dev server on the host (port 5173) |
| `make lint` | Backend `ruff` + frontend TypeScript typecheck |
| `make test` | Backend pytest (starts DB; uses migrate path) + frontend build smoke test |
| `make test-ci` | Same as lint + test, but skip Compose `db-up` (Postgres must already be up; used by Actions) |
| `make models` | Generate Pydantic, Zod, and field-meta from `backend/class-definitions/` |
| `make clean-models` | Remove generated Pydantic/Zod artefacts |
| `make clean` | Same as `clean-models` (clean source tree of codegen output) |

Destructive schema plans are rejected by default. To allow them locally:

```bash
make migrate MIGRATE_ARGS=--allow-destructive
```

Ensure host ports **5432**, **8000**, and **5173** are free before `make up`.

## Ports

| Service | Local Compose (host) | Notes |
| ------- | -------------------- | ----- |
| postgres | `5432` | Published for host tools and tests |
| api | `8000` | FastAPI; docs at `/docs` |
| web | `5173` | Maps to container port **3000**. Production / non-local deploys should expose **3000**, not 5173. |

## Smoke tests

After `make up` → `make migrate` → `make seed`:

- API health: `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`
- API docs: open `http://127.0.0.1:8000/docs` and run the Authorize loop above
- Web: open `http://127.0.0.1:5173` — unauthenticated users redirect to `/login`; after seed login, authenticated stub shows `/auth/me`
- Postgres: `docker compose exec postgres pg_isready -U untangled -d untangled`
- Web → API on the Compose network:

```bash
docker compose exec web wget -qO- http://api:8000/health
```

After `make db-up` only (postgres):

- `docker compose exec postgres pg_isready -U untangled -d untangled`

## API base URL (Compose)

| Caller | URL |
| ------ | ---- |
| Server-side / from web container | `http://api:8000` (`UNTANGLED_API_BASE_URL` in Compose) |
| Host `make frontend-dev` | `http://127.0.0.1:8000` (Makefile default) |

Authenticated browser traffic stays on the web tier (SSR loaders/actions). Do not point the browser at the API with a JS-held Bearer token — see ADR 002 / #67.

## What is placeholder vs real

| Piece | Status | Later work |
| ----- | ------ | ---------- |
| `make up` / `make down` | Full Compose runtime (postgres + api + web); **no auto-migrate/seed** | — |
| `make migrate` / `python -m untangled.schema` | Diff-based schema apply (YAML intent → DB) | Domain classes via same path |
| `make seed` / `python -m untangled.seed` | Users + RBAC + sample INC/CHG (intentional) | Role-admin HTTP APIs later |
| Auth (`/auth/login`, refresh, logout, `/auth/me`, `/auth/rbac-probe`) | Bearer JWT + rotating refresh + RBAC helpers | UI refresh (#14); hardening #33 / security review #67 |
| Incident / Change Request CRUD | Authenticated create/fetch/update/delete; UUID or friendly-id locator | — |
| Predicate search (`POST …/search`) | Envelope, logical ops, `eq`/`ne`/`empty`/`not-empty`, ordered `gt`/`gte`/`lt`/`lte` (#52), text patterns (#53), sort/projection/pagination (#51 / epic #11) | Case-insensitive search + text sort collation (#61); configurable nesting limits |
| `make db-up` / Postgres | Real DB for mapping persistence / tests | Keep persistence stack as domain grows |
| Backend `/health` | Real smoke endpoint (unauthenticated) | Domain APIs extend `backend/src/untangled/` |
| Class definitions + `make models` | Real codegen (includes Create/Update models) | See [class-definitions.md](./class-definitions.md) |
| Persistence (`untangled.persistence`) | Thin SQL create/fetch/update/delete + friendly-id assign | Domain routes stamp authenticated actor |
| Actor stub (`STUB_ACTOR_ID`) | Matches seeded admin UUID for FK-safe tests | Prefer current-user dependency on HTTP writes |
| Frontend SSR login + shell chrome | Real `/login`, httpOnly access JWT cookie, header/nav/context chrome | YAML nav (#66), refresh (#14) |
| `backend/requirements.lock` | Pinned deps | Regenerate when `pyproject.toml` changes |
| `frontend/package-lock.json` | Pinned deps | Regenerate when `package.json` changes |

## Monorepo layout

```text
backend/     Python FastAPI application (src layout; Dockerfile for api)
frontend/    React Router v7 framework-mode SSR app (Dockerfile for web)
docs/        Developer documentation
compose.yaml postgres + api + web
Makefile     Primary command entrypoint
```

See [frontend-stack.md](./frontend-stack.md) for the React Router v7 rationale.
See [class-definitions.md](./class-definitions.md) for YAML definitions, codegen, migrate, hashes, and PITR caveats.
