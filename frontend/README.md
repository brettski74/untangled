# Untangled frontend

React Router v7 **framework mode** SSR application for Milestone 1.

Login gate and authenticated stub live under `app/routes/` and `app/auth/`. Shell chrome, YAML nav, and token refresh extend this tree in place (#12 children / #14) rather than introducing a second frontend root.

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
