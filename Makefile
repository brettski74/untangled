.DEFAULT_GOAL := help

BACKEND_DIR := backend
FRONTEND_DIR := frontend
RUN_DIR := .run
PYTHON ?= python3
BACKEND_VENV := $(BACKEND_DIR)/.venv
BACKEND_PYTHON := $(BACKEND_VENV)/bin/python
BACKEND_PIP := $(BACKEND_VENV)/bin/pip

# Compose engine: unset COMPOSE → auto-detect (prefer Podman); env/CLI override wins.
# Empty COMPOSE is an error. Export so nested $(MAKE) keeps the same engine/wait flags.
_COMPOSE_ORIGIN := $(origin COMPOSE)
ifeq ($(_COMPOSE_ORIGIN),undefined)
  ifeq ($(shell podman compose version >/dev/null 2>&1 && echo yes),yes)
    COMPOSE := podman compose
  else ifeq ($(shell podman-compose version >/dev/null 2>&1 && echo yes),yes)
    COMPOSE := podman-compose
  else ifeq ($(shell docker compose version >/dev/null 2>&1 && echo yes),yes)
    COMPOSE := docker compose
  else ifeq ($(shell docker-compose version >/dev/null 2>&1 && echo yes),yes)
    COMPOSE := docker-compose
  else
    $(error No usable Compose engine found (tried: podman compose, podman-compose, docker compose, docker-compose). Install one, or set COMPOSE explicitly, e.g. COMPOSE="docker compose")
  endif
else ifeq ($(COMPOSE),)
  $(error COMPOSE is set but empty; unset it for auto-detect, or set a Compose command e.g. COMPOSE="docker compose")
endif

COMPOSE_SUPPORTS_WAIT := $(shell $(COMPOSE) up --help 2>/dev/null | grep -q -- '--wait' && echo yes || echo no)
ifeq ($(COMPOSE_SUPPORTS_WAIT),yes)
  COMPOSE_WAIT_FLAG := --wait
else
  COMPOSE_WAIT_FLAG :=
endif

export COMPOSE
export COMPOSE_WAIT_FLAG
export COMPOSE_SUPPORTS_WAIT

.PHONY: help install up down reinstall reinstall-keep-data db-up db-down db-wait deploy-pull backend-dev frontend-dev backend-install frontend-install lint test test-ci backend-lint backend-test frontend-lint frontend-test models migrate seed clean clean-models clean-run

help: ## List available targets
	@echo "Untangled developer commands (run from repository root):"
	@echo "  Compose engine: $(COMPOSE) (override: make COMPOSE=\"docker compose\" <target>)"
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: backend-install frontend-install ## Install backend and frontend dependencies

backend-install: ## Create backend venv and install locked dependencies
	@test -d $(BACKEND_VENV)/bin || $(PYTHON) -m venv $(BACKEND_VENV)
	$(BACKEND_PIP) install -U pip
	$(BACKEND_PIP) install -r $(BACKEND_DIR)/requirements.lock
	$(BACKEND_PIP) install -e $(BACKEND_DIR) --no-deps

frontend-install: ## Install frontend npm dependencies
	cd $(FRONTEND_DIR) && npm ci

up: ## Build and start postgres + api + web via Compose
	$(COMPOSE) up -d --build $(COMPOSE_WAIT_FLAG)
ifneq ($(COMPOSE_SUPPORTS_WAIT),yes)
	@$(MAKE) db-wait
endif

down: ## Stop Compose runtime (keeps named DB volume)
	$(COMPOSE) down

# Full local reset: wipe named volumes (Postgres), bring stack back, migrate, seed.
# Optional: WITH_HOST_INSTALL=1 also runs `make install` after teardown.
reinstall: ## Wipe DB volume, restart stack, migrate, and seed
	$(COMPOSE) down -v --remove-orphans
ifeq ($(WITH_HOST_INSTALL),1)
	$(MAKE) install
endif
	$(MAKE) up migrate seed
	@echo "==> Reinstall complete"
	@echo "    Web: http://127.0.0.1:5173"
	@echo "    API: http://127.0.0.1:8000"

reinstall-keep-data: ## Restart stack without wiping DB volume, then migrate and seed
	$(MAKE) down
ifeq ($(WITH_HOST_INSTALL),1)
	$(MAKE) install
endif
	$(MAKE) up migrate seed
	@echo "==> Reinstall complete"
	@echo "    Web: http://127.0.0.1:5173"
	@echo "    API: http://127.0.0.1:8000"

db-up: ## Start containerized PostgreSQL only (for host-run tests / persistence)
	$(COMPOSE) up -d postgres
	@$(MAKE) db-wait

db-down: ## Stop the Compose PostgreSQL service
	$(COMPOSE) stop postgres

db-wait: ## Wait until PostgreSQL accepts connections
	@echo "waiting for PostgreSQL..."; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if $(COMPOSE) exec -T postgres pg_isready -U untangled -d untangled >/dev/null 2>&1; then \
			echo "PostgreSQL is ready"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "PostgreSQL did not become ready in time"; \
	exit 1

# Shared Rocky / GHCR pin path on root compose.yaml (image pins + --no-build).
# Requires UNTANGLED_API_IMAGE and UNTANGLED_WEB_IMAGE. Does not migrate or seed.
# Expects a .env beside compose.yaml (Actions writes it; local deploy-pull uses one too).
deploy-pull: ## Pull pinned GHCR images and up stack without build (no migrate/seed)
	@test -n "$(UNTANGLED_API_IMAGE)" || (echo "UNTANGLED_API_IMAGE is required (e.g. ghcr.io/owner/untangled-api:sha-...)" >&2; exit 1)
	@test -n "$(UNTANGLED_WEB_IMAGE)" || (echo "UNTANGLED_WEB_IMAGE is required (e.g. ghcr.io/owner/untangled-web:sha-...)" >&2; exit 1)
	@test -f compose.yaml || (echo "compose.yaml missing" >&2; exit 1)
	@test -f .env || (echo ".env missing (see .env.example)" >&2; exit 1)
	@echo "deploy-pull: api=$(UNTANGLED_API_IMAGE)"
	@echo "deploy-pull: web=$(UNTANGLED_WEB_IMAGE)"
	@echo "deploy-pull: compose=$(COMPOSE)"
	@echo "step: pull images"
	@UNTANGLED_API_IMAGE="$(UNTANGLED_API_IMAGE)" UNTANGLED_WEB_IMAGE="$(UNTANGLED_WEB_IMAGE)" \
		$(COMPOSE) pull api web || (echo "deploy-pull ERROR [pull]: image pull failed" >&2; exit 1)
	@echo "step: up stack (no build, no migrate/seed)"
	@UNTANGLED_API_IMAGE="$(UNTANGLED_API_IMAGE)" UNTANGLED_WEB_IMAGE="$(UNTANGLED_WEB_IMAGE)" \
		$(COMPOSE) up -d --no-build $(COMPOSE_WAIT_FLAG) || (echo "deploy-pull ERROR [up]: compose up --no-build failed" >&2; exit 1)
	@echo "step: health check (unauthenticated alive only)"
	@ok=0; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36; do \
		if $(COMPOSE) exec -T api curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 \
			&& $(COMPOSE) exec -T web wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1; then \
			ok=1; \
			break; \
		fi; \
		sleep 5; \
	done; \
	if [ "$$ok" -ne 1 ]; then \
		echo "deploy-pull ERROR [health]: stack did not become healthy (api /health or web /)" >&2; \
		exit 1; \
	fi
	@echo "deploy-pull: success"

backend-dev: backend-install ## Run the FastAPI dev server in the foreground (host hot-reload)
	$(BACKEND_VENV)/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000

frontend-dev: frontend-install ## Run the React Router dev server in the foreground (host hot-reload)
	cd $(FRONTEND_DIR) && \
		UNTANGLED_API_BASE_URL=$${UNTANGLED_API_BASE_URL:-http://127.0.0.1:8000} \
		UNTANGLED_SESSION_SECRET=$${UNTANGLED_SESSION_SECRET:-local-dev-only-change-me-untangled-session-secret} \
		UNTANGLED_COOKIE_SECURE=$${UNTANGLED_COOKIE_SECURE:-false} \
		npm run dev -- --host 127.0.0.1 --port 5173

models: backend-install ## Generate Pydantic, Zod, and field-meta from YAML class definitions
	$(BACKEND_PYTHON) -m untangled.mapping

migrate: backend-install ## Apply YAML schema intent to PostgreSQL (intentional; not part of up)
	$(BACKEND_PYTHON) -m untangled.schema $(MIGRATE_ARGS)

seed: backend-install ## Idempotent local user seed (intentional; after migrate; not part of up)
	$(BACKEND_PYTHON) -m untangled.seed

lint: backend-lint frontend-lint ## Run backend and frontend lint checks

test: backend-test frontend-test ## Run backend and frontend tests

# Same leaf checks as lint + test. Skips Compose db-up only — Postgres must already
# be reachable (e.g. Actions service container). Does not shrink the check set.
test-ci: ## Lint + test without Compose db-up (Postgres must already be up)
	$(MAKE) lint
	$(MAKE) SKIP_DB_UP=1 test

backend-lint: backend-install ## Lint backend Python sources
	$(BACKEND_VENV)/bin/ruff check $(BACKEND_DIR)/src $(BACKEND_DIR)/tests

# SKIP_DB_UP=1: assume PostgreSQL is already reachable (CI service container).
backend-test: backend-install frontend-install ## Run backend pytest suite (includes DB-backed persistence tests)
ifneq ($(SKIP_DB_UP),1)
	@$(MAKE) db-up
endif
	PYTHONPATH=$(BACKEND_DIR)/src $(BACKEND_PYTHON) -m pytest $(BACKEND_DIR)

frontend-lint: frontend-install models ## Typecheck the frontend (minimal lint until ESLint is added)
	# CI=1: react-router typegen ignores vite clearScreen and wipes TTY scrollback otherwise
	cd $(FRONTEND_DIR) && CI=1 npm run typecheck

frontend-test: frontend-install models ## Run frontend unit tests and SSR production build smoke
	cd $(FRONTEND_DIR) && CI=1 npm test
	cd $(FRONTEND_DIR) && CI=1 npm run build

clean-models: ## Remove generated Pydantic/Zod artefacts
	rm -rf $(BACKEND_DIR)/src/untangled/generated $(FRONTEND_DIR)/app/generated

clean: clean-models ## Remove generated artefacts (leave a clean source tree)

clean-run: ## Remove leftover local run logs and pid files (legacy host up path)
	rm -rf $(RUN_DIR)
