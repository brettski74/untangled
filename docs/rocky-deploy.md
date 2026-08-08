# Shared Rocky deploy (GitHub Actions)

Teammate-operated **demo / shared** Rocky hosts only. GitHub Environments such as
`rocky9` are **secret and connection wiring** for those hosts — not the product’s
customer environment-promotion model.

Merge/push to `main` runs product CI, publishes `untangled-api` / `untangled-web`
to GHCR, then (when Environment connection variables + secrets are configured) SSHs to Rocky 9, **provisions
`Makefile` + root `compose.yaml` + `.env` from this commit**, and runs
`make deploy-pull` with **immutable `sha-…` image pins**.

One Compose file: root `compose.yaml`. Local `make up` uses `build:`; Rocky
`make deploy-pull` sets image pins and uses `compose up --no-build` (no separate
deploy Compose file).

The host does **not** need a git checkout or pre-placed Untangled files. It does
need **GNU Make** and a usable Compose engine (Podman-first on Rocky).

## Roles

| User | Role |
| ---- | ---- |
| `deploy` | CI/ops SSH identity used by Actions (dedicated deploy keypair) |
| `untangled` | App runtime user on the host (if that remains the host model) |

Do **not** put personal developer SSH keys in Actions.

## What the workflow does

On push to `main`, after both publish jobs succeed, job `deploy-rocky9`:

1. Checks out this repository on the runner.
2. Resolves pins `ghcr.io/<owner>/untangled-api:sha-<shortsha>` and
   `…/untangled-web:sha-<shortsha>`.
3. Writes a runtime `.env` from Environment secrets (values never logged).
4. SCPs `Makefile`, `compose.yaml`, and `.env` into `~/untangled/` on the host.
5. Runs `make deploy-pull` (pull → `up --no-build` → health via compose exec).
6. Runs `make deploy-migrate` (safe schema apply inside the API container —
   diff-based; refuses destructive plans; never `down -v` / volume wipe /
   `--allow-destructive`).
7. Runs `make deploy-seed` (demo baseline users, RBAC, sample tickets). Rocky is
   the shared demo host; this is intentional for that Environment only.

MVP acceptance host: **Rocky 9** (`dataphobe.com:2201`, Environment `rocky9`).
Rocky 10 can mirror later without redesign.

## Infra-owner handoff

1. Dedicated ed25519 Actions keypair; public key in `deploy` `authorized_keys`.
2. GitHub Environment `rocky9` variables (SSH connection) + secrets (key + runtime) below.
3. Host has GNU Make + Compose for `deploy` (Podman-first).
4. If GHCR packages are private: host `podman login ghcr.io`.
5. Reverse proxy / DNS as you already operate.

No manual copy of repo files onto the host. Actions provisions `~/untangled/` each
deploy. Postgres data stays in the Compose named volume across deploys.
Audit NDJSON files stay in the `untangled_audit` named volume on the API
service (API does not prune; retain/forward externally).

## GitHub Environment `rocky9`

### SSH / connection (Environment variables)

Non-secret connection wiring — set as **variables** (`vars.*`), not secrets.

| Variable | Example / notes |
| -------- | ---------------- |
| `DEPLOY_HOST` | `dataphobe.com` |
| `DEPLOY_PORT` | `2201` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -p 2201 dataphobe.com` (prefer pinning this). If unset, the workflow temporarily falls back to runtime `ssh-keyscan` (trust-on-first-use) — remove that fallback once this variable is configured. |

### SSH key + runtime (Environment secrets)

| Secret | Required | Notes |
| ------ | -------- | ----- |
| `DEPLOY_SSH_KEY` | yes | Private key only (Actions) |
| `POSTGRES_PASSWORD` | yes | Also used for default `DATABASE_URL` |
| `UNTANGLED_JWT_SECRET` | yes | |
| `UNTANGLED_SESSION_SECRET` | yes | |
| `POSTGRES_USER` | no | Default `untangled` |
| `POSTGRES_DB` | no | Default `untangled` |
| `DATABASE_URL` | no | Default `postgresql://USER:PASSWORD@postgres:5432/DB` |
| `UNTANGLED_REDIS_URL` | no | Default `redis://redis:6379/0` (local/Rocky Compose; no password in default) |
| `UNTANGLED_COOKIE_SECURE` | no | Default `true` (Actions also sets web host port `3000`) |
| `UNTANGLED_ACCESS_TOKEN_TTL_SECONDS` | no | Default `900` |
| `UNTANGLED_REFRESH_TOKEN_TTL_SECONDS` | no | Default `604800` |
| `UNTANGLED_AUDIT_LOG_DIR` | no | Default `/var/log/untangled/audit` (Compose volume `untangled_audit`) |

### Generate / rotate deploy key

```bash
ssh-keygen -t ed25519 -C "github-actions@untangled-deploy" -f untangled_deploy -N ""
# Install .pub on host; store private key in DEPLOY_SSH_KEY; remove local private copy when done.
```

Rotate by installing a new pubkey, updating the secret, confirming deploy, removing the old pubkey.

## GHCR pull authentication

Packages are intended **public** ([container-images.md](./container-images.md)).
If private, host-side `podman login ghcr.io` is the MVP path (no CI-passed token).

## What appears on the host after a deploy

```text
~/untangled/
  Makefile
  compose.yaml    # same root file as local Compose
  .env            # from Environment secrets (mode 600)
```

### Local `make deploy-pull`

```bash
# Repo-root .env from .env.example (gitignored); do not commit secrets.
make deploy-pull \
  UNTANGLED_API_IMAGE=ghcr.io/brettski74/untangled-api:sha-SHORT \
  UNTANGLED_WEB_IMAGE=ghcr.io/brettski74/untangled-web:sha-SHORT
```

`make up` remains the local build path and does not require that `.env`.

## Migrate and seed

Host-local `make migrate` / `make seed` need a `backend/` checkout and venv —
they are for developer machines, not Rocky.

On Rocky (Makefile + Compose only), after `deploy-pull`:

```bash
make deploy-migrate   # compose exec api → python -m untangled.schema (safe gate)
make deploy-seed      # compose exec api → python -m untangled.seed
```

`deploy-rocky9` runs both after every successful pull. Safe migrate is a no-op
when the DB already matches the image’s class definitions; it fails the job if
the plan would be destructive. Seed is idempotent (re-run resets seed user
passwords to env override or built-in default — see #134).

Override seed passwords via `SEED_*_PASSWORD` in the host `.env` if desired
(not yet wired as GitHub Environment secrets).

## Diagnose failed deploys

| Symptom | Where to look |
| ------- | -------------- |
| Job fails before SSH | Missing Environment variables/secrets; publish failed |
| Red `deploy-rocky9` after green validate/publish | Infra/host deploy — not a product test regression |
| SSH / SCP failure | Key, known_hosts, host/port/user |
| Make / Compose missing | Install GNU Make and Podman Compose |
| `ERROR [pull]` | GHCR visibility or host registry login |
| `ERROR [up]` | Compose, `.env`/secrets, ports; ensure `--no-build` path (no source tree on host). On Rocky Podman: short image names can fail non-interactively — postgres and redis must stay fully qualified (`docker.io/library/…`) |
| `ERROR [health]` | `compose exec` logs for api/web |
| `short-name resolution enforced but cannot prompt without a TTY` | Unqualified image in Compose (e.g. `postgres:…` / `redis:…`); use `docker.io/library/…` |

### Re-run / rollback

Re-run the workflow on the same or an older commit. Or after a prior provision:

```bash
cd ~/untangled
make deploy-pull \
  UNTANGLED_API_IMAGE=ghcr.io/brettski74/untangled-api:sha-OLDSHA \
  UNTANGLED_WEB_IMAGE=ghcr.io/brettski74/untangled-web:sha-OLDSHA
```

## Related docs

- [container-images.md](./container-images.md)
- [local-development.md](./local-development.md)
- Env example for Rocky / deploy-pull: `.env.example`
