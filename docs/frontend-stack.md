# Frontend stack (Milestone 1)

Untangled M1 uses **React Router v7 in framework mode** for the web application.

## Why React Router v7 framework mode

- **SSR-first** — pages render on the server by default, matching the M1 requirement for request-time rendering rather than a client-only SPA.
- **Loaders and actions** — route modules colocate data loading and mutations, which fits authenticated CRUD list/detail screens without bolting on a separate data layer.
- **Progressive enhancement** — forms and navigation can work with standard HTTP semantics before client hydration.
- **Single React codebase** — same components and routes for dev SSR, production SSR, and optional SPA-style navigation.
- **Login gate + shell chrome** — `/login` plus fail-closed authenticated layout with header / nav rail / context bar, YAML-driven class nav. Schema-driven list destinations (#13); detail read/edit + new-record create (#81–#83 / epic #71); token refresh #14.

## Auth delivery (SSR)

Access JWTs are held only in an **httpOnly** signed session cookie on the web tier. Browser-originated API needs go through SSR loaders/actions/resource routes (ADR `architecture/decisions/002-httponly-cookie-ssr-token-delivery.md`). Token refresh is #14; broader auth hardening is #67.

Required web env (Compose sets these; `make frontend-dev` supplies local defaults):

| Variable | Role |
| -------- | ---- |
| `UNTANGLED_API_BASE_URL` | Server-side API base (`http://api:8000` in Compose; `http://127.0.0.1:8000` on the host) |
| `UNTANGLED_SESSION_SECRET` | Cookie signing secret — **required**; no in-code default |
| `UNTANGLED_COOKIE_SECURE` | Secure cookies on by default; set `false` for plain-HTTP local |

Cookie `maxAge` is derived from the access JWT `exp` claim (no separate web TTL env).

## Key paths

| Path | Role |
| ---- | ---- |
| `frontend/app/routes.ts` | Route table (login, logout, authenticated layout, destinations) |
| `frontend/app/auth/` | Session cookie, API seam, Zod envelopes, gate helpers |
| `frontend/app/shell/` | Operator chrome (header, nav rail, context bar host, YAML nav). Context bar mount: routes portal chrome via `ShellContextBar` into one always-present layout host (inert when empty). Binding contract: ADR `architecture/decisions/005-portal-shell-context-bars.md`. |
| `frontend/app/list/` | Schema-driven list chrome (#13): context bar, quick filter, filter row + nested editor (`filter_chrome.tsx`), shared predicate text renderer (`predicate_text.ts`) |
| `frontend/app/detail/` | Schema-driven detail read/edit (#81–#82) + new-record (#83); `TESTPLAN.md` / `TESTPLAN-83.md` |
| `frontend/app/records/` | SSR search/fetch/update seams (Bearer via session). Fetch/search use `/api/v1` with FK identity enrichment; update remains unversioned. Shared helpers in `fk_identity.ts`. |
| `frontend/app/config/nav-bar.yaml` | M1 product-default nav (instance override later) |
| `frontend/app/root.tsx` | HTML shell / root layout |
| `frontend/app/routes/` | Route modules (loaders, actions, components) |
| `frontend/react-router.config.ts` | Framework configuration |

## Commands

From the repository root:

```bash
make frontend-dev   # HMR dev server (sets local auth env defaults)
make frontend-lint  # TypeScript typecheck
make frontend-test  # Unit tests + production build smoke
```

Official docs: [reactrouter.com](https://reactrouter.com/)
