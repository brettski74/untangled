# Edge reverse proxy, path contract, and auth cookies

Local Compose presents **one HTTPS origin** so the browser can call SSR, the API, and the auth service by path. Production TLS and perimeter routing stay **customer-owned**; this file is the path and cookie contract those edges must implement, plus how the local proxy behaves.

This is the [#211](https://github.com/brettski74/untangled/issues/211) skeleton. Live login still posts through SSR until [#212](https://github.com/brettski74/untangled/issues/212). Playwright still targets HTTP `:5173` (interim). Do not treat host-dev ports as the browser credential origin.

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
| `GET` | `/api/v2/auth/csrf` | Skeleton |
| `POST` | `/api/v2/auth/login` | Skeleton (CSRF/Origin only; not real login) |
| `POST` | `/api/v2/auth/logout` | Later |
| `POST` | `/api/v2/auth/refresh` | Later |
| `GET` | `/api/v2/auth/me` | Later |
| `POST` | `/api/v2/auth/change-password` | Later |

Python unversioned `/auth/*` remains for host-dev, Swagger, and current SSR login. It is **not** mounted on the public proxy origin.

Approved **anonymous** auth-session bootstrap (with `/health` on the API): `GET /api/v2/auth/csrf` and `POST /api/v2/auth/login`.

## Production edge

Operators terminate TLS and route the table above on their reverse proxy / Ingress / CDN. Untangled does not ship a production perimeter proxy. Do not copy the local Caddyfile or `tls` material into a public edge.

## Local Compose proxy

`make up` enables Compose profile `local-edge` (auth + Caddy). Rocky `./deploy.sh` does not.

- Browser origin: `https://127.0.0.1:8443` (`UNTANGLED_PROXY_HOST_PORT`, default 8443 → container 443).
- Host `5173` (web) and `8000` (api) stay published for host-dev, `/docs`, and current Playwright. They are **not** the browser credential origin.
- Auth is unpublished on the host; the browser reaches it only through the proxy.

### TLS files

Caddy uses gitignored `deploy/caddy/certs/dev.crt` and `dev.key`. You always need **both** (certificate + private key). `.crt` / `.pem` are the same PEM text; a certificate file alone cannot terminate TLS.

| State | `make up` / `make local-certs` |
| ----- | ------------------------------ |
| Both missing | Generate a self-signed pair (`127.0.0.1` + `localhost` SAN) |
| Both present | Use as-is (drop in mkcert or another local CA) |
| Exactly one present | Fail; copy the matching file or remove the orphan |

The OpenSSL pair will warn in browsers until you trust it. `curl -k` is fine for smoke checks. This is not a production TLS profile.

## Cookies and CSRF

Auth-set cookies are **host-only** (no `Domain`), `Path=/`, `SameSite=Lax`, `Secure` on the HTTPS origin.

| Cookie | Role |
| ------ | ---- |
| `__untangled_csrf` | Double-submit CSRF; **not** HttpOnly |
| `__untangled_auth_skeleton` | Placeholder only; **HttpOnly**. Not a session. SSR/API ignore it. Distinct from `__untangled_session`. |

`SameSite=Lax` is **not** enough for login CSRF (forced login does not need an existing cookie). `POST /api/v2/auth/login` requires:

1. Exact `Origin` match to `UNTANGLED_PUBLIC_ORIGIN` (scheme + host + port). Default `https://127.0.0.1:8443`. `localhost` is a different origin; no alias folding.
2. CSRF token from `X-CSRF-Token` or form field `csrf_token` matching the CSRF cookie (CSPRNG; double-submit).

Missing or mismatched Origin/CSRF → **403**, no skeleton cookie. Valid Origin+CSRF → **200** and the placeholder cookie. Passwords are not verified and no JWT is issued. That 200 is **not** the stable login contract (#212).

Until #212, SSR `POST /login` and this skeleton POST can both exist on the public origin. Treat that as interim.

## Forwarded client identity

Caddy **overwrites** inbound `Forwarded` / `X-Forwarded-*` (client-supplied values are not passed through). Auth is unpublished on the host. A helper parses Caddy's `Forwarded for=` (else the socket peer) and is unit-tested; the login skeleton does not yet attribute that IP on the request path (security events land in later #33 slices).

Full production trusted-proxy / hop-count productization is out of scope. Spoofed forwarded headers from an untrusted client must not win — that is why the local proxy overwrites rather than appending, and why auth is not published on the host.

## Smoke (local)

After `make up`:

```bash
curl -k https://127.0.0.1:8443/
curl -k https://127.0.0.1:8443/api/v2/auth/csrf
curl -k -X POST https://127.0.0.1:8443/api/v2/auth/login
```

The last call should be **403** (no Origin/CSRF). The csrf call should be **200** with a `Set-Cookie` for `__untangled_csrf`.
