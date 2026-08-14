# Repository structure

Monorepo layout for Milestone 1 and beyond.

```text
backend/          Python FastAPI API (convention-based mapping, domain APIs land here)
frontend/         React Router v7 SSR web app (shell UI and CRUD screens land here)
auth/             Dedicated JS/TS auth service (login/cookie/CSRF; #33 language exception)
docs/             Developer and architecture notes
Makefile          Primary developer command entrypoint
AGENTS.md         Engineering principles and conventions
```

Future tickets extend the existing `backend/` and `frontend/` trees in place. The `auth/` tree is the narrow dedicated-auth exception from [#33](https://github.com/brettski74/untangled/issues/33) — do not add further parallel application roots casually.

See [local-development.md](./local-development.md) for setup, PostgreSQL (`make db-up`),
smoke tests, intentional `make migrate` / `make seed`, and auth/`/docs` Authorize.
See [edge-proxy.md](./edge-proxy.md) for the local HTTPS origin, path contract, and cookie/CSRF rules.
See [class-definitions.md](./class-definitions.md) for YAML class definitions,
`make models` (Pydantic / Zod codegen), and diff-based migrate / persistence.
