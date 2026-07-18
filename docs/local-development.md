# Local development

Untangled is **containers-first**: the long-term local workflow is `make up` backed by Docker Compose (PostgreSQL, API, web). That Compose stack is **not implemented yet** — this ticket only scaffolds backend and frontend dev processes you can run directly on the host.

## Prerequisites

- Python 3.12+ (3.14 tested on Arch)
- Node.js 20+ and npm
- GNU Make

## First-time setup

From the repository root:

```bash
make install
```

This creates `backend/.venv`, installs pinned Python dependencies from `backend/requirements.lock`, installs the backend package in editable mode, and runs `npm ci` in `frontend/`.

## Common commands

| Command | Purpose |
| ------- | ------- |
| `make` or `make help` | List targets with one-line descriptions |
| `make up` | Start backend (port 8000) and frontend (port 5173) dev processes |
| `make down` | Stop processes started by `make up` |
| `make backend-dev` | Run FastAPI with reload in the foreground |
| `make frontend-dev` | Run React Router dev server in the foreground |
| `make lint` | Backend `ruff` + frontend TypeScript typecheck |
| `make test` | Backend pytest + frontend production build smoke test |
| `make models` | Generate Pydantic + Zod models from `backend/class-definitions/` |

Logs and pid files for `make up` live under `.run/` (gitignored).

## Smoke tests

After `make up`:

- Backend: `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`
- Frontend: open `http://127.0.0.1:5173` — minimal SSR welcome page

## What is placeholder vs real

| Piece | Status | Later work |
| ----- | ------ | ---------- |
| `make up` / `make down` | Local dev processes only | Compose ticket extends these targets in place |
| Backend `/health` | Real smoke endpoint | Domain APIs, auth, DB replace/extend `backend/src/untangled/` |
| Class definitions + `make models` | Real codegen (no Postgres) | Persistence / schema sync in mapping-layer child |
| Frontend welcome page | Real SSR scaffold | Shell UI, auth, API integration replace route modules in `frontend/app/` |
| `backend/requirements.lock` | Pinned deps | Regenerate when `pyproject.toml` changes |
| `frontend/package-lock.json` | Pinned deps | Regenerate when `package.json` changes |

## Monorepo layout

```text
backend/     Python FastAPI application (src layout)
frontend/    React Router v7 framework-mode SSR app
docs/        Developer documentation
Makefile     Primary command entrypoint
```

See [frontend-stack.md](./frontend-stack.md) for the React Router v7 rationale.
