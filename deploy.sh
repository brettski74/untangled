#!/usr/bin/env bash
# Shared-host / Rocky deploy: pull pinned images, up stack, safe migrate, regen seed passwords, seed.
# Local-dev stays on Make (make up / migrate / seed). This script is the remote deploy path.
#
# Usage (from directory with compose.yaml + .env):
#   ./deploy.sh --api-image ghcr.io/owner/untangled-api:sha-… \
#               --web-image ghcr.io/owner/untangled-web:sha-… \
#               --auth-image ghcr.io/owner/untangled-auth:sha-…
#
# Failsafes: never `down -v`, never volume wipe, never --allow-destructive.
# Seed passwords: regenerate seed-credentials.env every run; never echo/print values.

set -euo pipefail

SEED_CREDENTIALS_FILE="${SEED_CREDENTIALS_FILE:-seed-credentials.env}"
SEED_PASSWORD_VARS=(
  SEED_ADMIN_PASSWORD
  SEED_READONLY_PASSWORD
  SEED_READWRITE_PASSWORD
  SEED_CHANGE_PASSWORD
  SEED_INCIDENT_PASSWORD
)

API_IMAGE=""
WEB_IMAGE=""
AUTH_IMAGE=""

usage() {
  cat <<'EOF'
Usage: ./deploy.sh --api-image <ref> --web-image <ref> --auth-image <ref>

Requires compose.yaml and .env in the current directory (CI writes .env from
Environment secrets; values must not be logged).

Steps: pull → up --no-build → health → safe migrate → regenerate seed
credentials → seed. Never downs volumes or passes --allow-destructive.
Seed password values are never printed.
EOF
}

die() {
  echo "deploy.sh ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-image)
      [[ $# -ge 2 ]] || die "--api-image requires a value"
      API_IMAGE="$2"
      shift 2
      ;;
    --web-image)
      [[ $# -ge 2 ]] || die "--web-image requires a value"
      WEB_IMAGE="$2"
      shift 2
      ;;
    --auth-image)
      [[ $# -ge 2 ]] || die "--auth-image requires a value"
      AUTH_IMAGE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$API_IMAGE" ]] || die "--api-image is required"
[[ -n "$WEB_IMAGE" ]] || die "--web-image is required"
[[ -n "$AUTH_IMAGE" ]] || die "--auth-image is required"
[[ -f compose.yaml ]] || die "compose.yaml missing (run from deploy directory)"
[[ -f .env ]] || die ".env missing (CI or operator must provision it; see .env.example)"
[[ -f deploy/jwt/dev-es256-private.pem ]] || die "deploy/jwt/dev-es256-private.pem missing"
[[ -f deploy/jwt/dev-es256-public.pem ]] || die "deploy/jwt/dev-es256-public.pem missing"

resolve_compose() {
  if [[ -n "${COMPOSE:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_CMD=($COMPOSE)
    return
  fi
  if podman compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(podman compose)
  elif podman-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(podman-compose)
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    die "no usable Compose engine (tried: podman compose, podman-compose, docker compose, docker-compose); set COMPOSE"
  fi
}

compose() {
  # Fail closed: never inherit a developer COMPOSE_PROFILES=local-edge into Rocky.
  COMPOSE_PROFILES= UNTANGLED_API_IMAGE="$API_IMAGE" UNTANGLED_WEB_IMAGE="$WEB_IMAGE" \
    UNTANGLED_AUTH_IMAGE="$AUTH_IMAGE" \
    "${COMPOSE_CMD[@]}" "$@"
}

resolve_compose
COMPOSE_WAIT_FLAG=()
if "${COMPOSE_CMD[@]}" up --help 2>/dev/null | grep -q -- '--wait'; then
  COMPOSE_WAIT_FLAG=(--wait)
fi

echo "deploy.sh: api=${API_IMAGE}"
echo "deploy.sh: web=${WEB_IMAGE}"
echo "deploy.sh: auth=${AUTH_IMAGE}"
echo "deploy.sh: compose=${COMPOSE_CMD[*]}"

echo "step: pull images"
compose pull api web auth || die "[pull] image pull failed"

echo "step: up stack (no build; keeps named volumes; no migrate/seed yet)"
compose up -d --no-build "${COMPOSE_WAIT_FLAG[@]}" || die "[up] compose up --no-build failed"

echo "step: health check (unauthenticated alive only)"
ok=0
for _ in $(seq 1 36); do
  if compose exec -T api curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 \
    && compose exec -T web wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 \
    && compose exec -T auth node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 5
done
[[ "$ok" -eq 1 ]] || die "[health] stack did not become healthy (api /health, web /, or auth /health)"

echo "step: safe migrate (refuse destructive; no volume wipe)"
compose exec -T api python -m untangled.schema \
  --definitions /app/class-definitions \
  || die "[migrate] schema apply failed or refused destructive plan"

echo "step: regenerate seed credentials (${SEED_CREDENTIALS_FILE}; values not logged)"
umask 077
{
  printf '%s\n' '# Host-local seed passwords. Do not commit. chmod 600.'
  printf '%s\n' '# Regenerated on every deploy.sh run; previous passwords stop working after seed.'
  for v in "${SEED_PASSWORD_VARS[@]}"; do
    raw="$(head -c 48 /dev/urandom | base64 | tr -d '\n+/=')"
    pw="${raw:0:32}"
    if [[ "${#pw}" -ne 32 ]]; then
      die "failed to generate ${v}"
    fi
    printf '%s=%s\n' "$v" "$pw"
  done
} >"${SEED_CREDENTIALS_FILE}" || die "failed to write ${SEED_CREDENTIALS_FILE}"
chmod 600 "${SEED_CREDENTIALS_FILE}"
for v in "${SEED_PASSWORD_VARS[@]}"; do
  grep -q -E "^${v}=" "${SEED_CREDENTIALS_FILE}" || die "${SEED_CREDENTIALS_FILE} missing ${v}"
done

echo "step: seed (passwords from ${SEED_CREDENTIALS_FILE}; values not logged)"
# Source into this shell only; pass names with -e so values are not on argv / not echoed.
set -a
# shellcheck disable=SC1090
source "./${SEED_CREDENTIALS_FILE}"
set +a
compose exec -T \
  -e SEED_ADMIN_PASSWORD \
  -e SEED_READONLY_PASSWORD \
  -e SEED_READWRITE_PASSWORD \
  -e SEED_CHANGE_PASSWORD \
  -e SEED_INCIDENT_PASSWORD \
  api python -m untangled.seed \
  || die "[seed] seed failed (schema missing?)"

echo "deploy.sh: success (current seed credentials in ${SEED_CREDENTIALS_FILE} on host; not printed)"
