# Untangled backend

Minimal FastAPI scaffold for Milestone 1. Domain APIs, auth, database access, and migrations land in later tickets — extend this package in place rather than adding a parallel backend tree.

## Layout

- `src/untangled/` — application package
- `src/untangled/mapping/` — class-definition load + Pydantic/Zod codegen pipeline
- `src/untangled/persistence/` — PostgreSQL schema sync + thin SQL create/fetch/update
- `class-definitions/` — human-authored YAML class definitions
- `tests/` — pytest suite (includes DB-backed persistence tests; needs `make db-up`)

Generated models (gitignored) land in `src/untangled/generated/` after `make models`.
See [docs/class-definitions.md](../docs/class-definitions.md) and
[docs/local-development.md](../docs/local-development.md).

Audit stamps currently use a temporary actor stub (`STUB_ACTOR_ID`) until auth lands.

## Local run

Compose (preferred): from the repository root, `make up` starts postgres + api + web.

Host hot-reload: from the repository root:

```bash
make backend-dev
```

Or from this directory after `make install`:

```bash
.venv/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000
```

Smoke test: `GET http://127.0.0.1:8000/health` (docs at `/docs`)
