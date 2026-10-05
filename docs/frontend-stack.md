# Frontend stack (Milestone 1)

Untangled M1 uses **React Router v7 in framework mode** for the web application.

## Why React Router v7 framework mode

- **SSR-first** — pages render on the server by default, matching the M1 requirement for request-time rendering rather than a client-only SPA.
- **Loaders** — route modules colocate document GET data loading. List search, create, and update POST/PATCH from the browser to the domain API (not React Router actions).
- **Progressive enhancement** — forms and navigation can work with standard HTTP semantics before client hydration.
- **Single React codebase** — same components and routes for dev SSR, production SSR, and optional SPA-style navigation.
- **Login gate + shell chrome** — `/login` plus fail-closed authenticated layout with header / nav rail / context bar, YAML-driven class nav. Schema-driven list destinations (#13); detail read/edit + new-record create (#81–#83 / epic #71); access refresh (document GET bootstrap + in-app JS).

## Auth delivery (SSR)

The login **page** is SSR (`GET /login`). The browser posts credentials to `POST /api/v2/auth/login` on the public origin (Caddy locally). Auth sets HttpOnly `__untangled_access`. SSR loaders read and verify that cookie with the ES256 public key, then call the API with Bearer. Identity bootstrap is `GET /api/v2/auth/me` on the auth service (`UNTANGLED_AUTH_BASE_URL`). Change-password (voluntary and expired) is a browser `POST` to `/api/v2/auth/change-password` with the same CSRF/Origin rules as login. A signed `password_change_required` claim sends every authenticated nested route to `/expired-password` (bare chrome). The JWT is never exposed to JavaScript and is not returned in JSON.

When an **authenticated document GET** presents an expired-but-valid access JWT (not must-change), SSR returns **200** bootstrap HTML at that URL instead of redirecting to login. Nested loaders short-circuit (no `/me`, no domain fetch). Browser JS CSRF-POSTs `/api/v2/auth/refresh` (the Path-scoped refresh cookie never reaches SSR), then `location.replace`s. In-app `authenticated_fetch` uses the same refresh loop: a resource 401 with `retry: true` POSTs refresh; the live `max_retries` bound arrives on auth **soft-fail** 401 only. Hard 401 / 403 do not refresh. List search, create, and update use that helper on same-origin `/api/v2/{class_name}/…`. Nested document-GET Bearer 401 remains fail-closed ([#250](https://github.com/brettski74/untangled/issues/250)). Change-password abuse controls are #216.

The local HTTPS reverse proxy and browser→auth CSRF/cookie contract are documented in [edge-proxy.md](./edge-proxy.md). Playwright and interactive login use Compose Caddy at `https://localhost:8443`. SSR and the Vite dev server do not proxy `/api/v2/auth`.

Required web env (Compose sets these; `make frontend-dev` supplies local defaults):

| Variable | Role |
| -------- | ---- |
| `UNTANGLED_API_BASE_URL` | Server-side API base (`http://api:8000` in Compose; `http://localhost:8000` on the host) |
| `UNTANGLED_AUTH_BASE_URL` | Server-side auth base for `/me` (`http://auth:3000` in Compose; `http://localhost:3001` on the host) |
| `UNTANGLED_JWT_PUBLIC_KEY` or `UNTANGLED_JWT_PUBLIC_KEY_PATH` | ES256 public key — **required**; no in-code default |
| `UNTANGLED_COOKIE_SECURE` | Secure cookies on by default; set `false` for plain-HTTP local |
| `UNTANGLED_REDIS_URL` | Shared Redis for system_config cache invalidation (`redis://redis:6379/0` in Compose; host default `redis://localhost:6379/0`). Web subscribes on boot. Production hardening [#182](https://github.com/brettski74/untangled/issues/182) |

Cookie `maxAge` on `__untangled_access` is set by auth (JWT lifetime for must-change; remaining idle/hard-cap for a normal session). SSR `POST /logout` asks auth to delete this session, then expires `__untangled_access` and `__untangled_refresh` (`Path=/api/v2/auth/refresh`). `GET /logout` is 405.

## Key paths

| Path | Role |
| ---- | ---- |
| `frontend/app/routes.ts` | Route table (login, logout, authenticated layout, destinations) |
| `frontend/app/auth/` | Access-cookie verify, API seam, Zod envelopes, gate helpers |
| `frontend/app/shell/` | Operator chrome (header, nav rail, context bar host, YAML nav). Context bar mount: routes portal chrome via `ShellContextBar` into one always-present layout host (inert when empty). Binding contract: ADR `architecture/decisions/005-portal-shell-context-bars.md`. |
| `frontend/app/list/` | Schema-driven list chrome (#13): context bar, quick filter, filter row + nested editor (`filter_chrome.tsx`), shared predicate text renderer (`predicate_text.ts`) |
| `frontend/app/detail/` | Schema-driven detail read/edit (#81–#82) + new-record (#83); `TESTPLAN.md` / `TESTPLAN-83.md` |
| `frontend/app/records/` | SSR search/fetch/update/create seams (Bearer via session). Record CRUD uses `/api/v2/{class_name}` with FK identity enrichment on responses. Shared helpers in `fk_identity.ts`. |
| `frontend/app/coherence/` | Cache-coherence publish/subscribe abstraction (Redis pub/sub; not domain/audit bus) |
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
