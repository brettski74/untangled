# Edge reverse proxy, path contract, and auth cookies

Local Compose presents **one HTTPS origin** so the browser can call SSR, the API, and the auth service by path. Production TLS and perimeter routing stay **customer-owned**; this file is the path and cookie contract those edges must implement, plus how the local proxy behaves.

Browser login `POST`s to the auth service on this origin. The access JWT is stored only in an **HttpOnly** cookie (`__untangled_access`); it is not returned in JSON and is not readable by JavaScript. Playwright and host-dev use HTTP `:5173` through Vite or `auth/scripts/http_edge.mjs` so that path is same-origin without sending passwords through SSR.

## Path contract (pinned)

One public origin:

| Public prefix | Backend | Notes |
| ------------- | ------- | ----- |
| `/` (everything except `/api/`) | SSR (`web`) | Login **page** is `GET /login` |
| `/api/v2/auth/` | Auth service | Auth-session coherence group |
| `/api/` remainder (including `/api/v2/` records) | Python API | Domain API |

Auth-session paths (group stays on **v2** together):

| Method | Path | This slice |
| ------ | ---- | ---------- |
| `GET` | `/api/v2/auth/csrf` | Browser CSRF bootstrap (do not copy `Set-Cookie` through SSR) |
| `POST` | `/api/v2/auth/login` | Real login; ES256 access cookie |
| `POST` | `/api/v2/auth/logout` | Later (#14 / later #33 slices) |
| `POST` | `/api/v2/auth/refresh` | Later (#14) |
| `GET` | `/api/v2/auth/me` | Later; SSR still uses legacy unversioned Python `GET /auth/me` |
| `POST` | `/api/v2/auth/change-password` | Later; SSR still uses legacy unversioned Python `POST /auth/change-password` |

Python does not mount `/auth/login` or `/auth/refresh` (ordinary **404**). Remaining Python `/auth/me`, change-password, logout, and rbac-probe are **legacy unversioned** leftovers, not the standing identity contract. Login is `POST /api/v2/auth/login`.

Approved **anonymous** auth-session bootstrap (with `/health` on the API): `GET /api/v2/auth/csrf` and `POST /api/v2/auth/login`.

## Production edge

Operators terminate TLS and route the table above on their reverse proxy / Ingress / CDN. Untangled does not ship a production perimeter proxy. Do not copy the local Caddyfile or `tls` material into a public edge.

Rocky Compose publishes auth on host port **3001** (`UNTANGLED_AUTH_HOST_PORT`) so the customer edge can reach it. Browser clients must still use the public origin (`UNTANGLED_PUBLIC_ORIGIN`); do not point the browser at `:3001` directly.

## Local Compose proxy

`make up` enables Compose profile `local-edge` (Caddy only). Auth runs without that profile so Rocky `./deploy.sh` starts it too.

- Browser origin: `https://localhost:8443` (`UNTANGLED_PROXY_HOST_PORT`, default 8443 → container 443). `https://127.0.0.1:8443` and `https://[::1]:8443` **308** to that origin so auth's exact-Origin check still sees one host.
- Host `3000` (web), `3001` (auth), and `8000` (api) stay published for host-dev and `/docs`. They are **not** the browser credential origin.
- Playwright / `make frontend-dev`: `http://127.0.0.1:5173` via Vite proxy or `node auth/scripts/http_edge.mjs`. `http_edge` keeps the public `Host` (it does not rewrite it to the upstream port) so SSR action CSRF sees the browser origin, matching Caddy `reverse_proxy` and Vite's default `changeOrigin: false`.

### TLS files

Caddy uses gitignored `deploy/caddy/certs/dev.crt` and `dev.key`. You always need **both** (certificate + private key). `.crt` / `.pem` are the same PEM text; a certificate file alone cannot terminate TLS.

| State | `make up` / `make local-certs` |
| ----- | ------------------------------ |
| Both missing | Generate a self-signed pair (`DNS:localhost`, `IP:127.0.0.1`, `IP:::1`) |
| Both present | Use as-is (drop in mkcert or another local CA) |
| Exactly one present | Fail; copy the matching file or remove the orphan |

The OpenSSL pair will warn in browsers until you trust it. `curl -k` is fine for smoke checks. This is not a production TLS profile.

### JWT files

ES256 PEMs are gitignored `deploy/jwt/dev-es256-private.pem` and `dev-es256-public.pem`. Same both-missing / both-present / fail-if-one rule as the TLS files (`make local-jwt-keys` / `make up`). Auth mounts the private key; API and web mount the public key only.

## Cookies and CSRF

Auth-set cookies are **host-only** (no `Domain`), `Path=/`, `SameSite=Lax`, `Secure` on the HTTPS origin.

| Cookie | Role |
| ------ | ---- |
| `__untangled_csrf` | Double-submit CSRF; **not** HttpOnly |
| `__untangled_access` | Access JWT; **HttpOnly**. SSR verifies with the public key and uses the JWT as Bearer to the API. |

`SameSite=Lax` is **not** enough for login CSRF (forced login does not need an existing cookie). `POST /api/v2/auth/login` requires:

1. Exact `Origin` match to `UNTANGLED_PUBLIC_ORIGIN` (scheme + host + port). Default local Compose `https://localhost:8443`. Host-dev Playwright `http://127.0.0.1:5173`. `127.0.0.1` is a different origin; no alias folding.
2. CSRF token from `X-CSRF-Token` or form field `csrf_token` matching the CSRF cookie (CSPRNG; double-submit). The login page fetches CSRF from the **browser**.

Missing or mismatched Origin/CSRF → **403**, no access cookie. Auth also emits `auth.csrf_denied` (`reason` is `origin_mismatch` or `csrf_mismatch` on that one event type). The event records `csrf_header_length` and `csrf_cookie_length` (0 if missing), not raw token values. The client body stays `{ detail: "Forbidden" }` with no reason. SSR and Python API Origin/CSRF failures are [#223](https://github.com/brettski74/untangled/issues/223); they do not emit yet. Valid Origin+CSRF and valid password → **200** `{ ok: true }` when `Accept` includes `application/json` (JWT is **not** in the body), or **302** to a safe `next` path for form POST. Pipeline auth denials → **401** `{ detail: "Access denied" }` (no failure reason in the body). Hash-capacity shedding → **503**. Malformed JSON → **400**. Oversized body → **413**. Config or audit-write failure → **500** (no access cookie).

## Forwarded client identity

Caddy **overwrites** inbound `Forwarded` / `X-Forwarded-*` (client-supplied values are not passed through). Auth parses Caddy's `Forwarded` `for` / `proto` / `host` (else the socket peer, with proto/host from `UNTANGLED_PUBLIC_ORIGIN`) and records them on login security events. Redis login rate-limit uses that source IP (and the folded username, or `invalid-or-oversize`) as contexts; evaluate returns a delay and does not sleep. RL keys live under `auth:rl:` on `UNTANGLED_REDIS_URL` (Compose `redis://redis:6379/0`; host-dev `redis://localhost:6379/0`). Memory budget is `login_rate_limit_max_kib` on `system_config`.

Full production trusted-proxy / hop-count productization is out of scope. Spoofed forwarded headers from an untrusted client must not win — that is why the local proxy overwrites rather than appending.

## Smoke (local)

After `make up`:

```bash
curl -k https://localhost:8443/
curl -k https://localhost:8443/api/v2/auth/csrf
curl -k -X POST https://localhost:8443/api/v2/auth/login
```

The last call should be **403** (no Origin/CSRF) and should write an `auth.csrf_denied` line under the audit mount (local-edge: `.run/audit`). The csrf call should be **200** with a `Set-Cookie` for `__untangled_csrf`.
