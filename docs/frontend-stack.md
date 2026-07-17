# Frontend stack (Milestone 1)

Untangled M1 uses **React Router v7 in framework mode** for the web application.

## Why React Router v7 framework mode

- **SSR-first** — pages render on the server by default, matching the M1 requirement for request-time rendering rather than a client-only SPA.
- **Loaders and actions** — route modules colocate data loading and mutations, which fits authenticated CRUD list/detail screens without bolting on a separate data layer.
- **Progressive enhancement** — forms and navigation can work with standard HTTP semantics before client hydration.
- **Single React codebase** — same components and routes for dev SSR, production SSR, and optional SPA-style navigation.
- **Thin scaffold now** — this ticket only ships a minimal welcome route; the shell UI ticket replaces/extends `frontend/app/` in place.

## Key paths

| Path | Role |
| ---- | ---- |
| `frontend/app/routes.ts` | Route table (extend for shell, list, detail) |
| `frontend/app/root.tsx` | HTML shell / root layout |
| `frontend/app/routes/` | Route modules (loaders, actions, components) |
| `frontend/react-router.config.ts` | Framework configuration |

## Commands

From the repository root:

```bash
make frontend-dev   # HMR dev server
make frontend-lint  # TypeScript typecheck
make frontend-test  # Production build smoke test
```

Official docs: [reactrouter.com](https://reactrouter.com/)
