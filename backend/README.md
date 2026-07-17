# Untangled backend

Minimal FastAPI scaffold for Milestone 1. Domain APIs, auth, database access, and migrations land in later tickets — extend this package in place rather than adding a parallel backend tree.

## Layout

- `src/untangled/` — application package
- `tests/` — pytest suite (extend as APIs are added)

## Local run

From the repository root:

```bash
make backend-dev
```

Or from this directory after `make install`:

```bash
.venv/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000
```

Smoke test: `GET http://127.0.0.1:8000/health`
