# Untangled backend

Minimal FastAPI scaffold for Milestone 1. Domain APIs and auth land in later tickets — extend this package in place rather than adding a parallel backend tree.

## Layout

- `src/untangled/` — application package
- `src/untangled/mapping/` — class-definition load + Pydantic/Zod codegen pipeline
- `src/untangled/schema/` — Schema IR, diff-based migrate, version history
- `src/untangled/persistence/` — thin SQL create/fetch/update (schema apply via migrate)
- `class-definitions/` — human-authored YAML class definitions
- `tests/` — pytest suite (includes DB-backed persistence tests; needs `make db-up`)

Generated models (gitignored) land in `src/untangled/generated/` after `make models`.
See [docs/class-definitions.md](../docs/class-definitions.md) and
[docs/local-development.md](../docs/local-development.md).

Audit stamps currently use a temporary actor stub (`STUB_ACTOR_ID`) until auth lands.

## Schema migrate

Production entrypoint (also used by `make migrate` from the repo root):

```bash
.venv/bin/python -m untangled.schema
.venv/bin/python -m untangled.schema --allow-destructive
```

Uses `DATABASE_URL` or the documented local default. Migrate is intentional — not run on Compose/`make up` start. See the class-definitions doc for hashes, the destructive gate, and restore-point / PITR caveats.

## Local run

Compose (preferred): from the repository root, `make up` starts postgres + api + web. Then `make migrate` when you need schema applied.

Host hot-reload: from the repository root:

```bash
make backend-dev
```

Or from this directory after `make install`:

```bash
.venv/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000
```

Smoke test: `GET http://127.0.0.1:8000/health` (docs at `/docs`)
