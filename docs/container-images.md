# CI and container images (GHCR)

## Product CI vs image publish

GitHub Actions (`.github/workflows/ci.yml`) runs:

| Event | Product CI (`make lint` + `make test` equivalents) | Build/push images to GHCR |
| ----- | -------------------------------------------------- | ------------------------- |
| Pull request targeting `main` | Yes | No |
| Push to `main` | Yes | Yes, after CI succeeds |
| Push of a `v*` git tag | Yes | Yes, after CI succeeds |

Product CI mirrors local Make:

- `make lint` — backend `ruff`, frontend typecheck (including models codegen)
- `make test` — backend pytest (Postgres required) + frontend unit tests and SSR production build

In Actions, Postgres is a job service container. The workflow runs `make test-ci`, which is the same check set as `lint` + `test` but skips Compose `db-up` only.

**Product CI (lint/test) is not environment validation or promotion.** Passing CI means the product checks for that commit succeeded; it does not certify a staging/prod rollout.

## Image names and tags

Owner is the GitHub repository owner at publish time:

- `ghcr.io/{repository_owner}/untangled-api`
- `ghcr.io/{repository_owner}/untangled-web`

Examples for this repository (`brettski74`):

| When | Tags pushed |
| ---- | ----------- |
| Push to `main` (after green CI) | `latest`, `sha-{shortsha}` |
| Push of git tag `v1.2.3` (after green CI) | `v1.2.3`, `sha-{shortsha}` — not `latest` |

A `v*` image tag is a **tagged artefact** for that git commit only. It is not a certified release channel, environment promotion step, or proof the commit was on `main`. Pulling `latest` or a `v*` tag into any environment is an operator choice, not a supported promotion path.

Build contexts match `compose.yaml` (api: `backend/`; web: repo root + `frontend/Dockerfile`). Keep CI publish contexts aligned with Compose when Dockerfiles move.

## Example pulls

```bash
docker pull ghcr.io/brettski74/untangled-api:latest
docker pull ghcr.io/brettski74/untangled-web:latest

docker pull ghcr.io/brettski74/untangled-api:sha-4e433fa
docker pull ghcr.io/brettski74/untangled-web:sha-4e433fa

docker pull ghcr.io/brettski74/untangled-api:v1.2.3
docker pull ghcr.io/brettski74/untangled-web:v1.2.3
```

Replace the owner and SHA/tag with the values you intend to pin.

## Compose vs published images

Local day-to-day development still uses Compose `build:` (`make up`). Published GHCR images are optional artefacts for non-local hosts or experiments; this repository does not switch Compose to pull from GHCR by default.

GHCR publish is a **build artefact channel only** — not environment promotion, validation, or rollback. Published images alone do not start Postgres, apply migrations, or promote an environment.

Teammate shared Rocky hosts may pull pinned `sha-…` images after publish via the
`deploy-rocky9` job. That job SCPs root `Makefile` + `compose.yaml` + `.env` and
runs `make deploy-pull` (`up --no-build`). GitHub Environments are secret/wiring
scopes for those hosts — not the product customer promotion model. See
[rocky-deploy.md](./rocky-deploy.md).

## Package visibility and auth

Packages are intended to be **public** (anonymous `docker pull` without GHCR login), consistent with a public AGPL repository.

The first publish may create **private** packages depending on GitHub/org defaults. If pulls fail with auth errors after the first successful workflow run, set each package’s visibility to Public once in the GitHub UI (or via the API):

1. Open the repository → **Packages** (or the org/user packages list).
2. Select `untangled-api` / `untangled-web`.
3. Package settings → change visibility to **Public**.

If a package remains private, authenticate before pulling:

```bash
# PAT needs at least read:packages
echo "$CR_PAT" | docker login ghcr.io -u USERNAME --password-stdin
```

After visibility is public, anonymous pull works without login.
