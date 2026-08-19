# Edge reverse proxy, path contract, and auth cookies

Local Compose presents **one HTTPS origin** so the browser can call SSR, the API, and the auth service by path. Production TLS and perimeter routing stay **customer-owned**; this file is the path and cookie contract those edges must implement, plus how the local proxy behaves.

Browser login `POST`s to the auth service on this origin. The access JWT is stored only in an **HttpOnly** cookie (`__untangled_access`); it is not returned in JSON and is not readable by JavaScript. Playwright drives this same origin (`https://localhost:8443`). `make frontend-dev` on HTTP `:5173` is interactive host-dev only (Vite proxies `/api/v2/auth`); it is not an e2e or production gateway.

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
| `POST` | `/api/v2/auth/logout` | End this session (signed access JWT; CSRF+Origin). SSR `POST /logout` is the Sign out form. |
| `POST` | `/api/v2/auth/refresh` | Later (#14) |
| `GET` | `/api/v2/auth/me` | SSR identity / RBAC bootstrap; Bearer or access cookie |
| `POST` | `/api/v2/auth/change-password` | Browser posts (CSRF/Origin like login); JWT stays in the HttpOnly cookie |

Python does not mount `/auth/*` (ordinary **404**), including the former leftover `me`, change-password, logout, and rbac-probe routes. Login is `POST /api/v2/auth/login`. Identity bootstrap is `GET /api/v2/auth/me` on the auth service.

Approved **anonymous** auth-session bootstrap (with `/health` on the API): `GET /api/v2/auth/csrf` and `POST /api/v2/auth/login`.

## Production edge

Operators terminate TLS and route the table above on their reverse proxy / Ingress / CDN. Untangled does not ship a production perimeter proxy. Do not copy the local Caddyfile or `tls` material into a public edge.

Rocky Compose publishes auth on host port **3001** (`UNTANGLED_AUTH_HOST_PORT`) so the customer edge can reach it. Browser clients must still use the public origin (`UNTANGLED_PUBLIC_ORIGIN`); do not point the browser at `:3001` directly.

## Local Compose proxy

`make up` enables Compose profile `local-edge` (Caddy only). Auth runs without that profile so Rocky `./deploy.sh` starts it too.

- Browser origin: `https://localhost:8443` (`UNTANGLED_PROXY_HOST_PORT`, default 8443 → container 443). `https://127.0.0.1:8443` and `https://[::1]:8443` **308** to that origin so auth's exact-Origin check still sees one host.
- Host `3000` (web), `3001` (auth), and `8000` (api) stay published for host-dev and `/docs`. They are **not** the browser credential origin.
- Playwright: `https://localhost:8443` through this Caddy path table. `make frontend-dev` stays on HTTP `:5173` with Vite's `/api/v2/auth` proxy for interactive host-dev only.

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

The refresh HMAC secret is gitignored `deploy/jwt/refresh_secret.b64` (`make local-refresh-hmac` / `make up`). Auth mounts that file only. API, web, and Caddy must not. Missing or empty → auth does not start; the auth process does not generate a secret. Non-Make deploys (including `./deploy.sh`) must provision the file. `session_*` attributes on `system_config` are stored now and do not drive token issuance yet.

## Cookies and CSRF

Auth-set cookies are **host-only** (no `Domain`), `SameSite=Lax`, `Secure` on the HTTPS origin. `__untangled_access` is `Path=/`. `__untangled_refresh` is `Path=/api/v2/auth/refresh` only (browser transmits it solely on that path; SSR and API do not receive it).

| Cookie | Role |
| ------ | ---- |
| `__untangled_csrf` | Double-submit CSRF; **not** HttpOnly |
| `__untangled_access` | Access JWT; **HttpOnly**. SSR verifies with the public key and uses the JWT as Bearer to the API. |
| `__untangled_refresh` | Opaque refresh token; **HttpOnly**. Set on normal login. Must-change login does not set it. Refresh protocol is a later #14 child. |

`SameSite=Lax` is **not** enough for login CSRF (forced login does not need an existing cookie). `POST /api/v2/auth/login` requires:

1. Exact `Origin` match to `UNTANGLED_PUBLIC_ORIGIN` (scheme + host + port). Default local Compose and Playwright `https://localhost:8443`. Host-dev Vite `http://localhost:5173`. `127.0.0.1` is a different origin; no alias folding.
2. CSRF token from `X-CSRF-Token` or form field `csrf_token` matching the CSRF cookie (CSPRNG; double-submit). The login page fetches CSRF from the **browser**.

Missing or mismatched Origin/CSRF → **403**, no access cookie. Auth also emits `auth.csrf_denied` (`reason` is `origin_mismatch` or `csrf_mismatch` on that one event type). The event records `csrf_header_length` and `csrf_cookie_length` (0 if missing), not raw token values. The client body stays `{ detail: "Forbidden" }` with no reason. SSR and Python API Origin/CSRF failures are [#223](https://github.com/brettski74/untangled/issues/223); they do not emit yet. Valid Origin+CSRF and valid password → **200** `{ ok: true }` when `Accept` includes `application/json` (JWT is **not** in the body), or **302** to a safe `next` path for form POST. Pipeline auth denials → **401** `{ detail: "Access denied" }` (no failure reason in the body). Hash-capacity shedding → **503**. Malformed JSON → **400**. Oversized body → **413**. Config or audit-write failure → **500** (no access cookie).

`POST /api/v2/auth/change-password` uses the same Origin + CSRF rules. Success is `{ ok: true, detail: "Password change complete." }` (JWT is **not** in the body); auth sets a replacement `__untangled_access` cookie without `password_change_required`, keeping the previous `exp`.

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
