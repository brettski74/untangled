# Local development

Untangled is **containers-first**: `make up` brings up PostgreSQL, Redis, the API, the web app, the auth service, and (locally) an HTTPS reverse proxy via Compose (Podman or Docker).

For iterative coding with hot reload, use `make backend-dev` / `make frontend-dev` on the host (with `make db-up` / `make redis-up` if you need Postgres or Redis). Those are not required for the Compose runtime.

Schema apply and baseline seed are **intentional**: after `make up`, run `make migrate` then `make seed`. Neither runs automatically on Compose start.

Shared-host GHCR publish / Rocky deploy notes are local-only (gitignored): `docs/container-images.md` and `docs/rocky-deploy.md` when present on your machine.

## Prerequisites

- **Podman or Docker** with a usable Compose entrypoint — required for `make up` and DB-backed tests (see [Compose engine selection](#compose-engine-selection))
- GNU Make
- OpenSSL — used by `make local-certs` / `make up` to mint a self-signed `dev.crt` + `dev.key` when both are missing
- Python 3.12+ and Node.js 20+ — only needed for host-side `make install`, lint/test, and `*-dev` targets

## Compose engine selection

This section documents how the root `Makefile` selects and uses Compose for developers and operators (and for reuse by future start/shutdown scripts). It describes Make behavior—not a separate policy source.

The root `Makefile` picks a Compose command once per Make invocation and uses it for all Compose targets (`up`, `down`, `db-up`, `db-down`, `db-wait`, `redis-up`, `redis-down`, `redis-wait`, `reinstall`, etc.). Nested Make calls inherit the same selection.

**When `COMPOSE` is unset**, auto-detect uses this precedence (first *usable* wins; usable means a version/capability probe succeeds, not merely that a binary is on `PATH`):

1. `podman compose`
2. `podman-compose`
3. `docker compose`
4. `docker-compose` (legacy)

If none are usable, Make fails and lists the candidates that were tried.

**Prefer Podman when both Podman and Docker are installed.** That is intentional (RHEL/Rocky-style hosts). On a dual-engine machine where you want Docker Compose instead:

```bash
make COMPOSE="docker compose" up
```

**Override:** if you set `COMPOSE` in the environment or on the Make command line, that value always wins (no auto-detect). An empty `COMPOSE=` is an error — unset the variable for auto-detect, or pass a real command.

**Wait / readiness:** if the selected engine supports `compose up --wait`, `make up` uses it; otherwise `--wait` is omitted and readiness uses `make db-wait` and `make redis-wait` (capability probe of the selected engine, not a name check for “podman”).

Future production start/shutdown scripts should reuse this same precedence, override, and wait behavior so operator `make` and host scripts stay equivalent.

## First-time setup

From the repository root:

```bash
make up
make migrate   # apply YAML schema intent (Postgres must be reachable)
make seed      # idempotent baseline users + RBAC (roles/permissions/attachments)
```

That builds images and starts **postgres**, **redis**, **api**, and **web**, waiting until healthchecks pass, reconciles the database to `backend/class-definitions/`, then upserts the local seed users, RBAC attachments, and sample Incident / Change Request rows.

For host-side lint/test tooling:

```bash
make install
```

Default DB connection from the **host** (override with `DATABASE_URL`):

```text
postgresql://untangled:untangled@localhost:5432/untangled
```

Default Redis URL from the **host** (override with `UNTANGLED_REDIS_URL`):

```text
redis://localhost:6379/0
```

Inside the **api** / **web** containers, Compose sets `DATABASE_URL` / `UNTANGLED_REDIS_URL` to use the `postgres` / `redis` service hostnames. Redis is ephemeral (no named volume); local-dev has no Redis password — acceptable for Compose, not a production hardening claim ([#182](https://github.com/brettski74/untangled/issues/182)).

### Cache-coherence invalidation (Redis pub/sub)

API processes publish and subscribe **cache-coherence / invalidation** signals over Redis pub/sub (`untangled.coherence`). This is **not** the undecided internal domain/workflow event bus, **not** an audit channel, and **not** a durable queue.

| Item | Value |
| ---- | ----- |
| Transport | Redis pub/sub via `UNTANGLED_REDIS_URL` (same instance #162 will share) |
| System-config flush topic | `untangled.coherence.system_config.invalidate` |
| Payload | Minimal JSON object `{"v": 1}` only — no credentials, secrets, tokens, or PII |
| Delivery | Best-effort / at-most-once; offline subscribers miss signals; no replay |
| Ephemeral Redis | Restart clears pub/sub state; consumers tolerate loss (TTL / next load) |
| Connections | Command clients (publish / future GET/SET) are separate from dedicated subscriber connections |
| API startup | Subscriber for system-config flush starts in process lifespan; missing/unreachable Redis fails loudly |
| Publish on write | Fail-soft: system-config write still succeeds; publish failure is logged (Redis URLs redacted) |
| SSR / web | Auth and SSR each hold a TTL cache of `system_config` and subscribe-on-boot to the flush topic (this is the #224 auth-side subscribe, folded here). Web Compose injects `UNTANGLED_REDIS_URL`; Redis hardening remains [#182](https://github.com/brettski74/untangled/issues/182) |
| Spoof / integrity | Unauthenticated local Redis can deliver spoofed invalidates — residual until #182 |

Host `make backend-dev` expects Redis reachable at the default URL (`make redis-up` if needed). The unset-env host default is a **local-dev convenience only** — production-capable deploys must set an explicit `UNTANGLED_REDIS_URL` (Compose already does); an explicitly empty value fails closed.
## Auth (local)

| Setting | Default (Compose / docs) |
| ------- | ------------------------ |
| `UNTANGLED_JWT_PRIVATE_KEY_PATH` / `UNTANGLED_JWT_PUBLIC_KEY_PATH` | Gitignored `deploy/jwt/dev-es256-*.pem` (`make local-jwt-keys`). Auth gets both; API and web get the public key only. |
| `UNTANGLED_REFRESH_HMAC_SECRET_PATH` | Gitignored `deploy/jwt/refresh_secret.b64` (`make local-refresh-hmac` / `make up`). Auth-only; API, web, and Caddy must not receive this file. Base64 of ≥32 CSPRNG bytes. Missing, empty, invalid base64, or too-short decoded material → auth does not start. Auth never generates this file. Operators / Rocky CI provision it for non-Make deploys (`UNTANGLED_REFRESH_HMAC_SECRET` GitHub Environment secret is written to the file; it is not a container env). Login issuance TTLs come from `session_access_ttl_seconds`, `session_refresh_ttl_seconds`, and `session_total_ttl_seconds` on the `system_config` singleton (not env vars). |
| `UNTANGLED_PUBLIC_ORIGIN` | Exact browser origin. Compose / Playwright: `https://localhost:8443`. Host-dev Vite: `http://localhost:5173` |
| `UNTANGLED_COOKIE_SECURE` | `false` for plain-HTTP local (must set explicitly; unset defaults to Secure); `true` behind HTTPS |
| `UNTANGLED_API_BASE_URL` | Compose web: `http://api:8000`; host `make frontend-dev`: `http://localhost:8000` |
| `UNTANGLED_AUTH_BASE_URL` | Compose web SSR: `http://auth:3000`; host `make frontend-dev`: `http://localhost:3001` (`GET /api/v2/auth/me`) |
| `UNTANGLED_REDIS_URL` | Compose: `redis://redis:6379/0`; host-dev: `redis://localhost:6379/0` (coherence signaling + auth login RL; shared with future authz cache). Auth fails closed at boot if Redis is unreachable. |
| `UNTANGLED_AUDIT_LOG_DIR` | Container path: `/var/log/untangled/audit`. Local `make up` bind-mounts host `.run/audit` there. Rocky `./deploy.sh` uses named volume `untangled_audit` (prep chowns the dir to uid 1000). Host `make migrate` / `make seed` / `make auth-dev` / `make backend-dev`: defaults to `.run/audit` when unset. |
| `UNTANGLED_AUDIT_ROLLOVER_BYTES` | `1048576` (1 MiB) |
| `UNTANGLED_AUDIT_ROLLOVER_SECONDS` | `86400` (24 hours) |
| `UV_THREADPOOL_SIZE` | Auth: at least **12** (`login_hash_concurrency_limit` YAML max 10 + 2 headroom for audit fsync / JWT crypto). Compose and `make auth-dev` default to 12; the process raises a smaller value at boot. |
| `UNTANGLED_DEFINITIONS_DIR` | Optional. Absolute path to YAML class-definitions for unusual layouts only; Compose uses `/app/class-definitions` via the image WORKDIR (do not set this for normal local Compose). |

### Access / security audit log (local)

- The API and the auth service append **newline-delimited JSON** audit events under `UNTANGLED_AUDIT_LOG_DIR` (same mount; each process writes its own files, pid in the filename).
- **Local Compose (`make up`):** bind-mounts gitignored `.run/audit` to `/var/log/untangled/audit` so NDJSON is visible on the host. `make up` creates that directory as the invoking user before Compose (so Docker does not create a root-owned bind source). Direct `docker compose --profile local-edge up` without Make still defaults to the named volume.
- **Rocky / `./deploy.sh`:** named volume `untangled_audit`. Deploy preps the volume directory (uid `1000`, mode `0775`) **before** `compose up` so auth (`USER node`) can create files. API-as-root can still write.
- Host CLIs (`make migrate`, `make seed`) and `make auth-dev` / `make backend-dev` default to `.run/audit` when `UNTANGLED_AUDIT_LOG_DIR` is unset so fail-closed audit does not need `/var/log/untangled` on the workstation.
- `make down -v` removes named volumes (including unused `untangled_audit`); it does **not** delete bind-mount data. `make clean-run` removes `.run/`. Historical events already in an old named volume are not copied onto the bind.
- The API process **does not prune** rolled files — retain/forward externally (SIEM/export is a later ticket).
- With multiple API replicas, each process writes its own files under the shared mount (document forwarder topology; this MVP does not ship a distributed shipper). Auth replicas do the same.
- Auth login events use the **original client IP** from the trusted `Forwarded` header Caddy overwrites (else the socket peer). API `ip_address` is still the **direct peer** as seen by the API (in Compose UI traffic this is often the `web` container). Full trusted-proxy / `X-Forwarded-For` policy is tracked separately (#67).
- Bulk-read volume thresholds live on `system_config` (`audit_bulk_read_window_seconds`, `audit_bulk_read_max_searches`): crossing them emits a **signal-only** event (no throttle).

`password_*` `system_config` attributes are **password policy**. `login_*` attributes are **authentication process** (padding window, per-process hash concurrency, failed-attempt lock-of-record, Redis delay/lockout). Do not mix those prefixes. Login padding applies to **failed** attempts only; success returns immediately. When no hash slot is free the auth process returns **503** (capacity, not an auth verdict) and does not wait. PostgreSQL `failed_login_count` / `login_maximum_failed_count` is the account lock-of-record until admin unlock (#209). Redis rate-limit contexts (per folded username or `invalid-or-oversize`, and per source IP) are created only on failed login; evaluate returns a delay and does not sleep. Defaults: sample period S=300 s, lockout L=900 s, thresholds 10, L1/L2 delays 500/2000 ms. Prefix budget `login_rate_limit_max_kib` (min/default/max 8192/16384/262144 kiB): async purge of empty expired contexts above 80%; refuse new contexts if still over budget (existing lockouts are kept). Residual: an attacker who knows a valid username can still increment the PostgreSQL counter until the account is locked, and can L3-lock that username in Redis for L seconds after a Th burst. Auth cache of these knobs is TTL-only until [#224](https://github.com/brettski74/untangled/issues/224).

Seed users (usernames are case-normalized to lowercase):

| Username | Default password | Stable UUID | Role |
| -------- | ---------------- | ----------- | ---- |
| `admin` | `admin-change-me` | `01900000-0000-7000-8000-000000000001` | `admin` (permission `admin` = allow-all) |
| `readonly` | `readonly-change-me` | `01900000-0000-7000-8000-000000000002` | `read_only` (`{class}:read` + `:search`) |
| `readwrite` | `readwrite-change-me` | `01900000-0000-7000-8000-000000000003` | `read_write` (`create`/`read`/`search`/`update`; **no** `:delete`) |
| `change` | `change-change-me` | `01900000-0000-7000-8000-000000000004` | `change_request_read_write` |
| `incident` | `incident-change-me` | `01900000-0000-7000-8000-000000000005` | `incident_read_only` (`incident:read` + `:search`) |

Override passwords with `SEED_ADMIN_PASSWORD`, `SEED_READONLY_PASSWORD`, `SEED_READWRITE_PASSWORD`, `SEED_CHANGE_PASSWORD`, `SEED_INCIDENT_PASSWORD` when running `make seed`.

`make migrate` also ensures username `system` (`${system_user_id}`) as a non-login platform attribution principal. It has no password, no roles, and must not be activated. Sample ticket rows are still attributed to seeded `admin`.

### Permission keys

- Class+operation: `{class}:{operation}` where `class` is the YAML class `name` (snake_case) and `operation` is a declared permission name (`create`, `read`, `search`, `update`, `delete`, or a custom snake_case name). Example: `demo_item:read`, `incident:search`.
- `search` is separate from `read` for ordinary grants. Fetch requires `{class}:read` (or `admin` / `public`); search requires `{class}:search` (or `admin` / `public`).
- Class YAML `public: true` grants authenticated **read and search** authorization for mounted endpoints without those grants. Unauthenticated callers are still denied. `public` never grants create/update/delete. Mounting still requires declaring the standard permission names.
- Permission row ids are UUIDv5 from a fixed platform namespace plus the canonical key (including `admin`); seed reconciles by key.
- Nav list visibility still uses `can_read_class` (`:read` / `public` / `admin`); calling search still needs `:search` (or public/admin). Seed roles that should search are granted `:search` explicitly.
- Non-class key in M1: `admin` — grants all access in enforcement helpers.
- Seeded catalog is derived from class YAML `permissions` lists (plus bare `admin`). Product ticket/demo classes declare full CRUD+`search`; `system_config` declares `read`/`update`; auth/RBAC/internal classes declare none.
- Effective permissions are the **union** across all roles assigned to a user. Resolution is from the database per request (not JWT claims).

### Roles (stable seed UUIDs)

| Role `name` | UUID | Permissions |
| ----------- | ---- | ----------- |
| `admin` | `01900000-0000-7000-8000-000000000011` | `admin` |
| `read_only` | `01900000-0000-7000-8000-000000000012` | `{class}:read` + `:search` for `demo_item` / `incident` / `change_request` |
| `read_write` | `01900000-0000-7000-8000-000000000013` | `{class}:create`, `:read`, `:search`, `:update` for those classes |
| `change_request_read_write` | `01900000-0000-7000-8000-000000000014` | `change_request:create`, `:read`, `:search`, `:update` |
| `incident_read_only` | `01900000-0000-7000-8000-000000000015` | `incident:read`, `incident:search` |

### Enforcement helpers (for later domain routes)

Use FastAPI dependencies from `untangled.rbac`:

```python
from typing import Annotated, Any

from fastapi import Depends

from untangled.rbac import require_class_operation, require_permission

@router.get("/incidents")
def list_incidents(
    _user: Annotated[dict[str, Any], Depends(require_class_operation("incident", "read"))],
):
    ...

@router.delete("/incidents/{id}")
def delete_incident(
    _user: Annotated[dict[str, Any], Depends(require_permission("incident:delete"))],
):
    ...
```

Authenticated but unauthorized → **403**. Missing/invalid Bearer → **401**.

### UI login (SSR gate)

Local-dev convention: after `make up` + `make migrate` + `make seed`, open `https://localhost:8443` (trust the local cert or use `curl -k`) and sign in with a seed user (`admin` / `readonly` / `readwrite` / `change` / `incident` and their default passwords above). `https://127.0.0.1:8443` redirects there (`127.0.0.1` is a different origin). Host-dev: `make auth-dev` in one terminal and `make frontend-dev` in another, then `http://localhost:5173`.

- Unauthenticated routes redirect to `/login` (fail-closed).
- The login page is SSR; the browser posts to `POST /api/v2/auth/login` after `GET /api/v2/auth/csrf`. Auth sets HttpOnly `__untangled_access` (ES256). The JWT is not in the JSON body.
- SSR verifies that cookie with the public key and calls the API with Bearer. The authenticated layout loads `GET /api/v2/auth/me` on the auth service once per navigation tree; the header user chip uses display name (hover = username). A signed `password_change_required` claim redirects every nested route to `/expired-password` (bare form, no shell).
- Access expiry / API **401** expires the cookie and returns to login; **403** keeps the session. Token refresh is #14; YAML nav destinations are #66; broader auth security review is #67. Login padding, hash-capacity shedding, PostgreSQL failed-count lock-of-record, and Redis delay/L3 (#214) are in place. Password expiry / grace / must-change is #215; change-password abuse controls are #216.

Cookie posture: `httpOnly`, `sameSite=lax`, host-only, `secure` on by default with explicit local opt-out. Access cookie `Path=/`; refresh cookie `Path=/api/v2/auth/refresh` only (not sent to SSR or the API). Access JWT `exp` uses `session_access_ttl_seconds`; access cookie `Max-Age` follows remaining idle/hard-cap on a normal login and JWT lifetime on must-change. The JWT is never exposed to browser JavaScript. Path and CSRF details: [edge-proxy.md](./edge-proxy.md).

### `/docs` Authorize loop

1. Open `http://localhost:8000/docs`.
2. Sign in through the UI (Compose `:8443` or host-dev `:5173`), then copy the `__untangled_access` cookie value from the browser's cookie inspector (HttpOnly: not visible to page script).
3. Click **Authorize**, paste that JWT as Bearer, then Try-it-out on domain record routes. Identity/RBAC bootstrap is `GET /api/v2/auth/me` on the auth service (not Python). Python does not mount `/auth/*`.
4. Exercise Incident / Change Request CRUD (after `make migrate` + `make seed`):
   - Live record contract: `GET /api/v2/incident/{locator}` /
     `GET /api/v2/change_request/{locator}` (UUID or friendly number; path
     segment is the class `name`, no pluralization).
   - `POST` create / `PATCH` update / `DELETE` on `/api/v2/{class_name}`
     (admin only among seed roles for delete).
   - Junk locators → **422**; missing records → **404**; readonly cannot create → **403**.
5. Exercise predicate search (same Authorize token; requires `{class}:search` or `admin` / `public`):
   - `POST /api/v2/incident/search` and
     `POST /api/v2/change_request/search` (see [Predicate search](#predicate-search)
     and [API versioning](#api-versioning) below).
   - Omit `predicate` or set it to `null` to match all rows (still paginated / sorted / projected).
   - Empty matches → **200** with `items: []`, `total: 0` (never **404**).
6. When the access token expires (~15m), sign in again through the UI (refresh is #14).
7. Sign out from the header menu is a POST form to `/logout`. The POST forwards CSRF+Origin to auth; `GET /logout` is 405. On success it asks auth to delete this `user_session` and expires `__untangled_access` and `__untangled_refresh`. If auth is unreachable, SSR returns 503 and keeps the cookies. JS auto-refresh is a later [#14](https://github.com/brettski74/untangled/issues/14) child.

### API versioning

Public domain API versions are **path-based**: `/api/v{major}/…`.

- `/api/v2/{class_name}/…` is the sole record collection contract (class `name`
  as path segment; no pluralization). Create/update/delete/search/fetch are
  versioned here with FK identity enrichment.
- Legacy unversioned `/{collection}/…` and `/api/v1/{plural-collection}/…`
  record mounts have been removed.
- Every new public domain endpoint, and every existing public domain endpoint
  whose contract is changed, must have an API-version path. Operational
  endpoints such as `/health` and `/` are exempt.
- Backward-incompatible request/response changes increment the major path
  version and leave the previous version available for a documented
  compatibility period.

#### FK identity enrichment (record reads)

On `/api/v2` fetch, search, update, and create responses, each projected
foreign-key field (including audit `created_by` / `updated_by`) is either
JSON `null` or:

```json
{
  "id": "01901234-5678-7abc-89ab-cdef01234567",
  "display_name": "Alex Taylor",
  "friendly_id": "USR00000042"
}
```

Rules:

- `id` is always present for a non-null FK (canonical hyphenated UUID).
- `display_name` is included only when the target class has an effective
  `display_attribute`; value may be string or `null`.
- `friendly_id` is included only when the target class defines a `friendly_id`
  attribute; value may be string or `null`.
- Unsupported keys are omitted (not emitted as null).
- Non-FK UUID attributes remain scalar UUID strings.
- Search predicates, sort attributes, and create/update bodies continue to use
  **scalar UUID** values for FK fields.

### Predicate search

Generic, definition-driven search for any class mounted via the `/api/v2`
record router factory. First wired collections: Incident and Change Request.

| Method | Path | Permission |
| ------ | ---- | ---------- |
| `POST` | `/api/v2/{class_name}/search` | `{class}:search` (or `admin` / `public`) |

Examples: `POST /api/v2/incident/search`, `POST /api/v2/change_request/search`.

#### Request envelope

| Field | Required | Rules |
| ----- | -------- | ----- |
| `predicate` | no | Omit or `null` → match all rows. Otherwise a single predicate tree root (below). |
| `sort` | no | Array of `{ "attribute", "direction" }` where `direction` is exactly `asc` or `desc` (case-sensitive). `direction` defaults to `asc` if omitted or `null` (nullable in the schema). Default `[]` (stability suffix only). Bad direction or unknown sort attribute → **422**. |
| `attributes` | no | Snake_case names to include **in addition to `id`**. Omit or `[]` → `{ "id": … }` only. Unknown names → **422**. Duplicates ignored (first wins). |
| `limit` | no | Default **20**, maximum **200**. Outside 1..200 → **422**. |
| `offset` | no | Default **0**. Negative → **422**. |

#### Predicate grammar (delivered)

Every node has an `op` (snake_case string values). Logical nodes:

| `op` | Children | Meaning |
| ---- | -------- | ------- |
| `and` | `predicates`: non-empty array | All children match |
| `or` | `predicates`: non-empty array | Any child matches |
| `not` | `predicate`: one child | Negation |

Comparison nodes use `attribute` (snake_case, same names as create/fetch bodies and system fields):

| `op` | Extra | Meaning |
| ---- | ----- | ------- |
| `eq` | `value` (required, non-null) | Equals |
| `ne` | `value` (required, non-null) | Not equals |
| `gt` | `value` (required, non-null) | Greater than |
| `gte` | `value` (required, non-null) | Greater than or equal |
| `lt` | `value` (required, non-null) | Less than |
| `lte` | `value` (required, non-null) | Less than or equal |
| `contains` | `value` (required, string) | Substring match (`LIKE`, case-sensitive) |
| `starts_with` | `value` (required, string) | Prefix match (`LIKE`, case-sensitive) |
| `ends_with` | `value` (required, string) | Suffix match (`LIKE`, case-sensitive) |
| `regexp` | `value` (required, string) | POSIX regex match (`~`, case-sensitive) |
| `empty` | *(none)* | `IS NULL` |
| `not_empty` | *(none)* | `IS NOT NULL` |

- `eq` / `ne` / `empty` / `not_empty` apply to **all** mapped attribute types (including system fields).
- `gt` / `gte` / `lt` / `lte` apply to ordered types: **text-family** types
  (`compact_text`, `choice`, `status`, `text`, `multiline_text`, and deprecated
  `string`), plus **`integer`**, **`float`**, **`decimal`**, **`datetime`**,
  **`friendly_id`**. **Not** `boolean` or `uuid` (including FK uuid attributes)
  → **422**.
- `contains` / `starts_with` / `ends_with` / `regexp` apply to the **text
  family** and **`friendly_id`**. Other types → **422**.
  **Note:** `multiline_text` keeps the same operator eligibility as short text
  for M1 consistency; pattern/ordered filters on long bodies may scan heavily
  and are tracked as follow-on performance debt (predicate model / U8).
- Text comparisons are **case-sensitive**. No trim; no implicit casting across incompatible types.
- **Ordered text filters** (`gt` / `gte` / `lt` / `lte` on text-family /
  `friendly_id`) use PostgreSQL `COLLATE "C"` (byte/codepoint order) so results
  are deterministic across database locales. Non-ASCII codepoints sort after all
  ASCII. This is not the same as Unicode locale ordering.
- **Text `sort` collation** still uses the database default (may disagree with C-ordered filters in the same request). Aligning sort with filter collation and case-insensitive search is deferred ([#61](https://github.com/brettski74/untangled/issues/61)).
- **NULL and ordered / equality ops:** rows with a NULL attribute do not match `eq` / `ne` / `gt` / `gte` / `lt` / `lte` (SQL three-valued logic). `lt X` and `gte X` therefore do **not** partition the table. Optional booleans are tri-state: unset (`NULL`) matches neither `eq true` nor `eq false` — use `empty` / `not_empty`, or prefer required booleans once schema defaults/backfill exist ([#62](https://github.com/brettski74/untangled/issues/62)). Use `empty` / `not_empty` for null checks — `value: null` on value-taking ops → **422**.
- **`risk_score` (Change Request):** optional integer; M1 seed/docs convention is **0–100** (not yet range-validated by the API).
- **Friendly-id ordered compares** are lexicographic on the stored text (prefix + digits). With consistent prefixes and pad width this usually tracks numeric order; pad-width differences dominate (e.g. `INC10` sorts before `INC9` if those were the literal stored values without zero-padding).
- LIKE pattern ops treat `%`, `_`, and `\` in the search value as **literals** (escaped; SQL uses `ESCAPE '\'`).
- Unknown `op`, unknown `attribute`, wrong value type, invalid typed values, or invalid `regexp` pattern → **422**.
- Existing envelope `limit` / `offset` caps still bound all search queries (including ordered predicates).
- Pathological regex or leading-wildcard `LIKE` can be expensive at scale; M1 treats that as a client foot-gun (no dedicated timeout/length cap in this slice).

#### Sort stability

1. Apply caller `sort` entries in order.
2. Unless `created_at` already appears, append `{ "attribute": "created_at", "direction": "desc" }`.
3. Unless `id` already appears, append `{ "attribute": "id", "direction": "desc" }`.

#### Response

```json
{
  "items": [{ "id": "…", "number": "INC00000001", "status": "new" }],
  "limit": 20,
  "offset": 0,
  "total": 123
}
```

`total` is the match count before limit/offset. Each item always includes `id`; other fields only if requested via `attributes`.

#### Search nesting / budget guardrails (system-config)

Limits come from the `system-config` singleton via in-process helpers (clamped to
YAML min/max). Seeded defaults:

| Attribute | Default | Effect |
| --------- | ------- | ------ |
| `max-search-nesting-depth` | 3 | Root at depth 1; children of logical nodes increment depth. Exceed → **422**. |
| `max-search-nesting-length` | **20** | Max children in any one `predicates` array. Exceed → **422**. |
| `max-search-total-predicates` | 50 | Max predicate nodes in the tree (every `op` node, counted recursively). Exceed → **422**. |
| `max-search-total-regexp` | 3 | Max `regexp` predicates in the tree. Exceed → **422**. |

Nesting-length default is **20** (stricter than the former hard-coded **50**).
If system-config cannot be read, search refuses to run (**503**); limits are
never invented on the search path.

Search client-input failures: container shape, unexpected keys, missing required fields/children, and JSON parse failures → **400**; values, ranges, enums, typed-field mismatches, and domain rules → **422**. Framework (FastAPI/Pydantic) validation is reclassified at the app level using the same taxonomy.

#### Example

```json
{
  "predicate": {
    "op": "and",
    "predicates": [
      { "op": "eq", "attribute": "status", "value": "new" },
      { "op": "ne", "attribute": "severity", "value": "Low" }
    ]
  },
  "sort": [{ "attribute": "status", "direction": "asc" }],
  "attributes": ["number", "summary", "status"],
  "limit": 20,
  "offset": 0
}
```

### Seed tickets (environment-local numbers)

After a fresh migrate + seed, sample rows use **stable UUIDs** (safe for docs / fetch-by-id). Friendly `number` values come from PostgreSQL sequences and may differ after a DB reset — they are **not** portable across environments.

| Class | Stable seed UUID | Typical first number on a fresh DB |
| ----- | ---------------- | ---------------------------------- |
| Incident | `01900000-0000-7000-8000-000000000021` … `026` | `INC00000001` … |
| Change Request | `01900000-0000-7000-8000-000000000031` … `039`, `040` … `044` | `CHG00000001` … |

Well-known catalog ids:

| Name | UUID | Constant | Notes |
| ---- | ---- | -------- | ----- |
| `${system-config-id}` | `01900000-0000-7000-8000-000000000050` | `SYSTEM_CONFIG_ID` | Singleton row; migrate insert-once; `public` authenticated fetch; update = admin among seed roles |
| `${system_user_id}` | `01900000-0000-7000-8000-000000000006` | `SYSTEM_USER_ID` | Platform attribution principal (`system`); migrate inserts it; **cannot log in**; not a seed login user |

Six incident rows and fourteen change_request rows are seeded; full stable UUID constants live in `backend/src/untangled/seed/tickets.py`.

`GET /health` and `/docs` stay public. There is no “auth disabled” mode.

## Common commands

| Command | Purpose |
| ------- | ------- |
| `make` or `make help` | List targets with one-line descriptions |
| `make up` | Build and start postgres + redis + api + web + local-edge proxy/auth via Compose (does **not** migrate or seed). Generates `deploy/caddy/certs/dev.crt` + `dev.key` when both are missing. |
| `make down` | Stop the Compose stack (keeps the named DB volume; Redis is ephemeral) |
| `make local-certs` | Create self-signed proxy TLS files when both are missing; never overwrites an existing pair |
| `make reinstall` | Wipe named DB volume, then `up` → `migrate` → `seed` (add `WITH_HOST_INSTALL=1` to also run `make install`) |
| `make reinstall-keep-data` | Same as `reinstall` but keeps the Postgres volume (`make down` only) |
| `make db-up` | Start PostgreSQL only (for host-run tests / persistence) |
| `make db-down` | Stop the Compose PostgreSQL service |
| `make db-wait` | Wait until PostgreSQL accepts connections |
| `make redis-up` | Start Redis only (for host-run coherence / cache work) |
| `make redis-down` | Stop the Compose Redis service |
| `make redis-wait` | Wait until Redis accepts connections |
| `make migrate` | Apply YAML schema intent via production CLI (`python -m untangled.schema`) |
| `make seed` | Idempotent seed of baseline users + RBAC + sample INC/CHG (`python -m untangled.seed`) |
| `make backend-dev` | Run FastAPI with reload on the host (port 8000) |
| `make frontend-dev` | Run React Router dev server on the host (port 5173; proxies `/api/v2/auth` to `:3001`) |
| `make auth-dev` | Run the auth service on the host (port 3001) |
| `make lint` | Backend `ruff` + frontend TypeScript typecheck + auth typecheck |
| `make test` | Backend pytest (starts DB + Redis; uses migrate path) + frontend build smoke + auth unit tests |
| `make test-ci` | Same as lint + test, but skip Compose `db-up` / `redis-up` (services must already be up; used by Actions) |
| `make e2e` | Full Playwright browser suite against Compose Caddy `https://localhost:8443` (`make up` + migrate + seed) |
| `make e2e-smoke` | Playwright `@smoke` subset (CI gate; same stack prereqs as `e2e`) |
| `make models` | Generate Pydantic, Zod, and field-meta from `backend/class-definitions/` |
| `make clean-models` | Remove generated Pydantic/Zod artefacts |
| `make clean` | Same as `clean-models` (clean source tree of codegen output) |

Destructive schema plans are rejected by default. Re-run with
`--allow-destructive` to apply drops: removed YAML classes, leftover tables such
as unused `refresh_token`, or any other extra `public` BASE TABLE. Migrate’s
bookkeeping tables `schema_versions` and `schema_version_class_hashes` are left
alone.

```bash
make migrate MIGRATE_ARGS=--allow-destructive
```

Ensure host ports **5432**, **6379**, **8000**, **3000**, **3001**, **5173**, and **8443** are free before `make up` (or skip host-dev ports you are not using).

## Ports

| Service | Local Compose (host) | Notes |
| ------- | -------------------- | ----- |
| postgres | `5432` | Published for host tools and tests |
| redis | `6379` | Ephemeral; published for host tools and tests |
| api | `8000` | FastAPI; docs at `/docs`. Not the browser credential origin. |
| web | `3000` | Maps to container port **3000**. |
| auth | `3001` | Maps to container port **3000**. Customer edge / host-dev. Not the browser credential origin. |
| proxy | `8443` | Local HTTPS browser origin (`local-edge` profile). Playwright default. See [edge-proxy.md](./edge-proxy.md). |
| Vite | `5173` | Host-dev only (`make frontend-dev`). Not the e2e origin. |

## Smoke tests

After `make up` → `make migrate` → `make seed`:

- API health: `curl http://localhost:8000/health` → `{"status":"ok"}`
- API docs: open `http://localhost:8000/docs` and run the Authorize loop above
- Web: open `http://localhost:3000` (SSR only; login needs the public origin)
- HTTPS proxy (browser origin): `curl -k https://localhost:8443/` and `curl -k https://localhost:8443/api/v2/auth/csrf` — see [edge-proxy.md](./edge-proxy.md)
- Postgres: `docker compose exec postgres pg_isready -U untangled -d untangled`
- Redis: `docker compose exec redis redis-cli ping` → `PONG`
- Web → API on the Compose network:

```bash
docker compose exec web wget -qO- http://api:8000/health
```

### Playwright browser E2E

Specs live under `frontend/e2e/`. CI **gates** on the `@smoke` tag (`make e2e-smoke`). The full suite also runs in CI afterward as a **non-gating** step (`continue-on-error`) so regressions show up without failing the check. Locally: `make e2e`.

Prerequisites: `make up` (postgres, redis, api, web, auth, and Caddy on `:8443`) plus `make migrate` and `make seed`. CI uses the same origin in front of Compose Caddy; `compose.ci-e2e.yaml` is the e2e job overlay only (GitHub postgres/redis stay as Actions services). First-time browser install:

```bash
cd frontend && npx playwright install chromium
```

Then:

```bash
make e2e-smoke   # CI-equivalent gate
make e2e         # full suite
```

Override base URL with `PLAYWRIGHT_BASE_URL` if needed. Playwright ignores the self-signed local Caddy cert (`ignoreHTTPSErrors`); that is a test fixture, not a product TLS profile. `make frontend-dev` on `:5173` is interactive host-dev only (Vite proxies `/api/v2/auth` to the auth service) and is not an e2e origin.

After `make db-up` only (postgres):

- `docker compose exec postgres pg_isready -U untangled -d untangled`

After `make redis-up` only (redis):

- `docker compose exec redis redis-cli ping`

## API base URL (Compose)

| Caller | URL |
| ------ | ---- |
| Server-side domain API / from web container | `http://api:8000` (`UNTANGLED_API_BASE_URL` in Compose) |
| Server-side auth `/me` / from web container | `http://auth:3000` (`UNTANGLED_AUTH_BASE_URL` in Compose) |
| Host `make frontend-dev` domain API | `http://localhost:8000` (Makefile default) |
| Host `make frontend-dev` auth | `http://localhost:3001` (Makefile default) |

Authenticated browser login posts to `/api/v2/auth/` on the public origin. Domain API calls stay on the web tier (SSR loaders/actions). Do not put the access JWT in JavaScript.

## What is placeholder vs real

| Piece | Status | Later work |
| ----- | ------ | ---------- |
| `make up` / `make down` | Full Compose runtime (postgres + redis + api + web + auth + local-edge proxy); **no auto-migrate/seed** | — |
| `make migrate` / `python -m untangled.schema` | Diff-based schema apply (YAML intent → DB) | Domain classes via same path |
| `make seed` / `python -m untangled.seed` | Users + RBAC + sample INC/CHG (intentional) | Role-admin HTTP APIs later |
| Auth (`POST /api/v2/auth/login`, `GET /me`, `POST /change-password`, `POST /logout`) | ES256 access JWT from auth; API/SSR verify public key; Python `/auth/*` unmounted; login padding / hash cap / PG failed-count lock (#213); Redis RL delay/L3/purge (#214); password expiry / grace / must-change (#215); auth + SSR `system_config` coherence subscribe; Sign out deletes this `user_session`; must-change password success issues the first refresh cookie; `invalidate_user_sessions` on change-password logs out all of that user's sessions | JS/document auto-refresh (#14); change-password abuse (#216); unlock (#209) |
| Auth service + HTTPS proxy | Real login + CSRF + `__untangled_access` on `/api/v2/auth/` (me, change-password, logout); Caddy local-edge; Playwright `https://localhost:8443` | JS/document auto-refresh (#14 children 6–7) |
| Incident / Change Request CRUD | Authenticated create/fetch/update/delete; UUID or friendly_id locator | — |
| Predicate search (`POST …/search`) | Envelope, logical ops, `eq`/`ne`/`empty`/`not_empty`, ordered `gt`/`gte`/`lt`/`lte` (#52), text patterns (#53), sort/projection/pagination (#51 / epic #11) | Case-insensitive search + text sort collation (#61); search-editor progressive limit UX (#152) |
| `make db-up` / Postgres | Real DB for mapping persistence / tests | Keep persistence stack as domain grows |
| `make redis-up` / Redis | Shared coherence + cache instance (ephemeral) | Authz cache (#162); Redis hardening (#182) |
| Backend `/health` | Real smoke endpoint (unauthenticated) | Domain APIs extend `backend/src/untangled/` |
| Class definitions + `make models` | Real codegen (includes Create/Update models) | See [class-definitions.md](./class-definitions.md) |
| Persistence (`untangled.persistence`) | Thin SQL create/fetch/update/delete + friendly_id assign | Domain routes stamp authenticated actor |
| System principal (`SYSTEM_USER_ID`) | Distinct non-login actor for migrate/bootstrap/non-HTTP stamps | HTTP writes use the authenticated user; `#155` bootstrap uses this id |
| Frontend SSR login + shell chrome | Real `/login`, httpOnly access JWT cookie, header/nav/context chrome | YAML nav (#66), refresh (#14) |
| `backend/requirements.lock` | Pinned deps | Regenerate when `pyproject.toml` changes |
| `frontend/package-lock.json` | Pinned deps | Regenerate when `package.json` changes |
| `auth/package-lock.json` | Pinned deps | Regenerate when `auth/package.json` changes |

## Monorepo layout

```text
backend/     Python FastAPI application (src layout; Dockerfile for api)
frontend/    React Router v7 framework-mode SSR app (Dockerfile for web)
auth/        Dedicated JS/TS auth service (Dockerfile; always started)
docs/        Developer documentation
compose.yaml postgres + redis + api + web + auth; profile local-edge adds proxy
Makefile     Primary command entrypoint
```

See [frontend-stack.md](./frontend-stack.md) for the React Router v7 rationale.
See [class-definitions.md](./class-definitions.md) for YAML definitions, codegen, migrate, hashes, and PITR caveats.
