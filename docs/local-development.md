# Local development

Untangled is **containers-first**: `make up` brings up PostgreSQL, the API, and the web app via Docker Compose.

For iterative coding with hot reload, use `make backend-dev` / `make frontend-dev` on the host (with `make db-up` if you need Postgres). Those are not required for the Compose runtime.

Schema apply and baseline seed are **intentional**: after `make up`, run `make migrate` then `make seed`. Neither runs automatically on Compose start.

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

That builds images and starts **postgres**, **api**, and **web**, waiting until healthchecks pass, reconciles the database to `backend/class-definitions/`, then upserts the three local seed users, RBAC attachments, and sample Incident / Change Request rows.

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
| `UNTANGLED_DEFINITIONS_DIR` | Optional. Absolute path to YAML class-definitions for unusual layouts only; Compose uses `/app/class-definitions` via the image WORKDIR (do not set this for normal local Compose). |

Seed users (usernames are case-normalized to lowercase):

| Username | Default password | Stable UUID | Role |
| -------- | ---------------- | ----------- | ---- |
| `admin` | `admin-change-me` | `01900000-0000-7000-8000-000000000001` | `admin` (permission `admin` = allow-all) |
| `readonly` | `readonly-change-me` | `01900000-0000-7000-8000-000000000002` | `read-only` (`{class}:read`) |
| `readwrite` | `readwrite-change-me` | `01900000-0000-7000-8000-000000000003` | `read-write` (create/read/update; **no** `:delete`, **no** `admin`) |

Override passwords with `SEED_ADMIN_PASSWORD`, `SEED_READONLY_PASSWORD`, `SEED_READWRITE_PASSWORD` when running `make seed`.

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

### `/docs` Authorize loop

1. Open `http://127.0.0.1:8000/docs`.
2. `POST /auth/login` (OAuth2 password form) with a seed username/password — copy `access_token`.
3. Click **Authorize**, paste the access token as Bearer, then Try-it-out on `GET /auth/me` (roles + effective permission keys).
4. Hit `GET /auth/rbac-probe` (requires `demo-item:read` or `admin`). All three seed users succeed; a user with no roles gets **403**.
5. Exercise Incident / Change Request CRUD (after `make migrate` + `make seed`):
   - `GET /incidents/{locator}` / `GET /change-requests/{locator}` with either the stable seed UUID or the friendly number (`INC…` / `CHG…`).
   - `POST` create (omit `number` — server assigns it), `PATCH` update, `DELETE` (admin only among seed roles).
   - Junk locators → **400**; missing records → **404**; readonly cannot create → **403**.
6. Exercise predicate search (same Authorize token; requires `{class}:read`):
   - `POST /incidents/search` and `POST /change-requests/search` with a JSON body (see [Predicate search](#predicate-search) below).
   - Omit `predicate` or set it to `null` to match all rows (still paginated / sorted / projected).
   - Empty matches → **200** with `items: []`, `total: 0` (never **404**).
7. When the access token expires (~15m), `POST /auth/refresh` with the refresh token, then Authorize again with the new access token.
8. `POST /auth/logout` with the refresh token to revoke it.

### Predicate search

Generic, definition-driven search for any class mounted via the class router factory. First wired collections: Incident and Change Request.

| Method | Path | Permission |
| ------ | ---- | ---------- |
| `POST` | `/{collection}/search` | `{class}:read` |

Examples: `POST /incidents/search`, `POST /change-requests/search`.

#### Request envelope

| Field | Required | Rules |
| ----- | -------- | ----- |
| `predicate` | no | Omit or `null` → match all rows. Otherwise a single predicate tree root (below). |
| `sort` | no | Array of `{ "attribute", "direction" }` where `direction` is `asc` or `desc`. Default `[]` (stability suffix only). Unknown attribute or bad direction → **400**. |
| `attributes` | no | Snake_case names to include **in addition to `id`**. Omit or `[]` → `{ "id": … }` only. Unknown names → **400**. Duplicates ignored (first wins). |
| `limit` | no | Default **20**, maximum **200**. Outside 1..200 → **400**. |
| `offset` | no | Default **0**. Negative → **400**. |

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
| `empty` | *(none)* | `IS NULL` |
| `not-empty` | *(none)* | `IS NOT NULL` |

- `eq` / `ne` / `empty` / `not-empty` apply to **all** mapped attribute types (including system fields).
- Text comparisons are **case-sensitive**. No trim; no implicit casting across incompatible types.
- Use `empty` / `not-empty` for null checks — `value: null` on `eq`/`ne` → **400**.
- Unknown `op`, unknown `attribute`, wrong shape, or wrong value type → **400**.
- Operators reserved for later slices (`gt` / `gte` / `lt` / `lte`, `contains` / `starts-with` / `ends-with` / `regexp`) are rejected as **not implemented yet** (**400**) until those children ship.

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
| `max-search-nesting-depth` | 3 | Root at depth 1; children of logical nodes increment depth. Exceed → **400**. |
| `max-search-nesting-length` | 50 | Max children in any one `predicates` array. Exceed → **400**. |

Configurable system parameters for these limits are deferred.

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
| Incident | `01900000-0000-7000-8000-000000000021` | `INC00000001` |
| Incident | `01900000-0000-7000-8000-000000000022` | `INC00000002` |
| Change Request | `01900000-0000-7000-8000-000000000031` | `CHG00000001` |
| Change Request | `01900000-0000-7000-8000-000000000032` | `CHG00000002` |

`GET /health` and `/docs` stay public. There is no “auth disabled” mode.

## Common commands

| Command | Purpose |
| ------- | ------- |
| `make` or `make help` | List targets with one-line descriptions |
| `make up` | Build and start postgres + api + web via Compose (does **not** migrate or seed) |
| `make down` | Stop the Compose stack (keeps the named DB volume) |
| `make db-up` | Start PostgreSQL only (for host-run tests / persistence) |
| `make db-down` | Stop the Compose PostgreSQL service |
| `make db-wait` | Wait until PostgreSQL accepts connections |
| `make migrate` | Apply YAML schema intent via production CLI (`python -m untangled.schema`) |
| `make seed` | Idempotent seed of baseline users + RBAC + sample INC/CHG (`python -m untangled.seed`) |
| `make backend-dev` | Run FastAPI with reload on the host (port 8000) |
| `make frontend-dev` | Run React Router dev server on the host (port 5173) |
| `make lint` | Backend `ruff` + frontend TypeScript typecheck |
| `make test` | Backend pytest (starts DB; uses migrate path) + frontend build smoke test |
| `make models` | Generate Pydantic + Zod models from `backend/class-definitions/` |
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
- Web: open `http://127.0.0.1:5173` — SSR welcome page (does not call the API yet)
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
| Server-side / from web container | `http://api:8000` (`API_BASE_URL` in Compose) |
| Browser on the host (later UI work) | `http://127.0.0.1:8000` |

The welcome page does not call the API in this milestone slice; the env and network smoke above prove the path for later wiring.

## What is placeholder vs real

| Piece | Status | Later work |
| ----- | ------ | ---------- |
| `make up` / `make down` | Full Compose runtime (postgres + api + web); **no auto-migrate/seed** | — |
| `make migrate` / `python -m untangled.schema` | Diff-based schema apply (YAML intent → DB) | Domain classes via same path |
| `make seed` / `python -m untangled.seed` | Users + RBAC + sample INC/CHG (intentional) | Role-admin HTTP APIs later |
| Auth (`/auth/login`, refresh, logout, `/auth/me`, `/auth/rbac-probe`) | Bearer JWT + rotating refresh + RBAC helpers | UI login; hardening #33 |
| Incident / Change Request CRUD | Authenticated create/fetch/update/delete; UUID or friendly-id locator | — |
| Predicate search (`POST …/search`) | Slice A: envelope, `and`/`or`/`not`, `eq`/`ne`/`empty`/`not-empty`, sort/projection/pagination (#51 / epic #11) | Ordered ops (#52); text pattern ops (#53); configurable nesting limits |
| `make db-up` / Postgres | Real DB for mapping persistence / tests | Keep persistence stack as domain grows |
| Backend `/health` | Real smoke endpoint (unauthenticated) | Domain APIs extend `backend/src/untangled/` |
| Class definitions + `make models` | Real codegen (includes Create/Update models) | See [class-definitions.md](./class-definitions.md) |
| Persistence (`untangled.persistence`) | Thin SQL create/fetch/update/delete + friendly-id assign | Domain routes stamp authenticated actor |
| Actor stub (`STUB_ACTOR_ID`) | Matches seeded admin UUID for FK-safe tests | Prefer current-user dependency on HTTP writes |
| Frontend welcome page | Real SSR scaffold | Shell UI, auth, API integration in `frontend/app/` |
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
