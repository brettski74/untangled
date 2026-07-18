# Local development

Untangled is **containers-first**: the long-term local workflow is `make up` backed by Docker Compose (PostgreSQL, API, web). Today you get:

- Host-run API + web via `make up` / `make down` (scaffold until #5 lands full Compose)
- **PostgreSQL only** via `compose.yaml` and `make db-up` / `make db-down` (mapping persistence; #5 may absorb/reshape this wiring later)

## Prerequisites

- Python 3.12+ (3.14 tested on Arch)
- Node.js 20+ and npm
- GNU Make
- Docker with Compose v2 (`docker compose`) for PostgreSQL and DB-backed tests

## First-time setup

From the repository root:

```bash
make install
make db-up
```

This creates `backend/.venv`, installs pinned Python dependencies from `backend/requirements.lock`, installs the backend package in editable mode, runs `npm ci` in `frontend/`, and starts PostgreSQL.

Default connection (override with `DATABASE_URL`):

```text
postgresql://untangled:untangled@127.0.0.1:5432/untangled
```

## Common commands

| Command | Purpose |
| ------- | ------- |
| `make` or `make help` | List targets with one-line descriptions |
| `make up` | Start backend (port 8000) and frontend (port 5173) dev processes |
| `make down` | Stop processes started by `make up` |
| `make db-up` | Start PostgreSQL via Compose and wait until ready |
| `make db-down` | Stop the Compose PostgreSQL service |
| `make db-wait` | Wait until PostgreSQL accepts connections |
| `make backend-dev` | Run FastAPI with reload in the foreground |
| `make frontend-dev` | Run React Router dev server in the foreground |
| `make lint` | Backend `ruff` + frontend TypeScript typecheck |
| `make test` | Backend pytest (starts DB) + frontend production build smoke test |
| `make models` | Generate Pydantic + Zod models from `backend/class-definitions/` |
| `make clean-models` | Remove generated Pydantic/Zod artefacts |
| `make clean` | Same as `clean-models` (clean source tree of codegen output) |
| `make clean-run` | Remove `.run/` logs and pid files |

Logs and pid files for `make up` live under `.run/` (gitignored).

## Smoke tests

After `make up`:

- Backend: `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`
- Frontend: open `http://127.0.0.1:5173` — minimal SSR welcome page

After `make db-up`:

- `docker compose exec postgres pg_isready -U untangled -d untangled`

## What is placeholder vs real

| Piece | Status | Later work |
| ----- | ------ | ---------- |
| `make up` / `make down` | Local API/web processes only | Compose ticket (#5) extends these targets in place |
| `make db-up` / Postgres | Real DB for mapping persistence | #5 may reshape compose layout; keep persistence stack |
| Backend `/health` | Real smoke endpoint | Domain APIs, auth replace/extend `backend/src/untangled/` |
| Class definitions + `make models` | Real codegen | See [class-definitions.md](./class-definitions.md) |
| Persistence (`untangled.persistence`) | Schema sync + create/fetch/update | Formal migrations later; auth replaces actor stub |
| Actor stub (`STUB_ACTOR_ID`) | Temporary well-known UUID for audit stamps | Replace when auth lands |
| Frontend welcome page | Real SSR scaffold | Shell UI, auth, API integration in `frontend/app/` |
| `backend/requirements.lock` | Pinned deps | Regenerate when `pyproject.toml` changes |
| `frontend/package-lock.json` | Pinned deps | Regenerate when `package.json` changes |

## Monorepo layout

```text
backend/     Python FastAPI application (src layout)
frontend/    React Router v7 framework-mode SSR app
docs/        Developer documentation
compose.yaml PostgreSQL for local/dev tests (minimal; #5 may expand)
Makefile     Primary command entrypoint
```

See [frontend-stack.md](./frontend-stack.md) for the React Router v7 rationale.
See [class-definitions.md](./class-definitions.md) for YAML definitions, codegen, and schema apply.
