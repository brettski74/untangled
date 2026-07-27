# Untangled frontend

React Router v7 **framework mode** SSR application for Milestone 1.

Login gate lives under `app/routes/` and `app/auth/`; operator chrome under `app/shell/`; product-default nav YAML under `app/config/nav-bar.yaml`. Schema-driven **list** destinations are #13; **detail** read layout is #81 (epic #71); **new** remains a placeholder until #83; token refresh is #14.

Detail test plan: [`app/detail/TESTPLAN.md`](./app/detail/TESTPLAN.md).

Generated Zod schemas and class field metadata live under `app/generated/` (gitignored) — run `make models` from the repo root before typecheck/build when that tree is missing.

## Commands

Prefer the repository root Makefile:

```bash
make frontend-dev
make frontend-lint
make frontend-test
```

Or from this directory after `npm ci` (export `UNTANGLED_API_BASE_URL` and `UNTANGLED_SESSION_SECRET` for `dev`/`start`):

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

## Documentation

- [Frontend stack rationale](../docs/frontend-stack.md)
- [Local development](../docs/local-development.md)

Official React Router docs: [reactrouter.com](https://reactrouter.com/)
