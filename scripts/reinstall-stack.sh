#!/usr/bin/env bash
# Tear down the Compose stack and bring it back up using project Make targets.
# Mirrors first-time setup in docs/local-development.md:
#   make up && make migrate && make seed
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="${COMPOSE:-docker compose}"
KEEP_DATA=0
WITH_HOST_INSTALL=0

usage() {
  cat <<'USAGE'
Usage: scripts/reinstall-stack.sh [options]

Remove Compose containers, rebuild/start the stack, then migrate and seed.

Options:
  --keep-data           Stop/remove containers but keep the Postgres volume
  --with-host-install   Also run `make install` (backend venv + frontend npm)
  -h, --help            Show this help

Environment:
  COMPOSE               Compose command (default: docker compose)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-data) KEEP_DATA=1 ;;
    --with-host-install) WITH_HOST_INSTALL=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

echo "==> Removing Compose containers"
if [[ "$KEEP_DATA" -eq 1 ]]; then
  # Equivalent to `make down` (named DB volume preserved).
  $COMPOSE down --remove-orphans
else
  # Full reset: containers + named volumes (untangled_pgdata).
  $COMPOSE down -v --remove-orphans
fi

if [[ "$WITH_HOST_INSTALL" -eq 1 ]]; then
  echo "==> Installing host dependencies (make install)"
  make install
fi

echo "==> Building and starting stack (make up)"
make up

echo "==> Applying schema (make migrate)"
make migrate

echo "==> Seeding baseline data (make seed)"
make seed

echo "==> Reinstall complete"
echo "    Web: http://127.0.0.1:5173"
echo "    API: http://127.0.0.1:8000"
