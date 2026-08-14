# Untangled frontend

React Router v7 **framework mode** SSR application for Milestone 1.

Login gate lives under `app/routes/` and `app/auth/`; operator chrome under `app/shell/`; product-default nav YAML under `app/config/nav-bar.yaml`. Schema-driven **list** destinations are #13; **detail** read/edit and **new-record** create are epic #71 (#81–#83). New-record test plan: [`app/detail/TESTPLAN-83.md`](./app/detail/TESTPLAN-83.md). Token refresh is #14.

Detail test plan: [`app/detail/TESTPLAN.md`](./app/detail/TESTPLAN.md).

Generated Zod schemas and class field metadata live under `app/generated/` (gitignored) — run `make models` from the repo root before typecheck/build when that tree is missing.

## Commands

Prefer the repository root Makefile:

```bash
make frontend-dev
make frontend-lint
make frontend-test
```

Or from this directory after `npm ci` (export `UNTANGLED_API_BASE_URL` and `UNTANGLED_JWT_PUBLIC_KEY_PATH` for `dev`/`start`):

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
