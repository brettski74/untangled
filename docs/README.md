# Repository structure

Monorepo layout for Milestone 1 and beyond.

```text
backend/          Python FastAPI API (convention-based mapping, auth, domain APIs land here)
frontend/         React Router v7 SSR web app (shell UI and CRUD screens land here)
docs/             Developer and architecture notes
Makefile          Primary developer command entrypoint
AGENTS.md         Engineering principles and conventions
```

Future tickets extend the existing `backend/` and `frontend/` trees in place — do not add parallel application roots.

See [local-development.md](./local-development.md) for setup, PostgreSQL (`make db-up`),
smoke tests, intentional `make migrate` / `make seed`, and auth/`/docs` Authorize.
See [class-definitions.md](./class-definitions.md) for YAML class definitions,
`make models` (Pydantic / Zod codegen), and diff-based migrate / persistence.
