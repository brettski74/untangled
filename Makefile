.DEFAULT_GOAL := help

BACKEND_DIR := backend
FRONTEND_DIR := frontend
AUTH_DIR := auth
RUN_DIR := .run
PYTHON ?= python3
BACKEND_VENV := $(BACKEND_DIR)/.venv
BACKEND_PYTHON := $(BACKEND_VENV)/bin/python
BACKEND_PIP := $(BACKEND_VENV)/bin/pip
LOCAL_EDGE_CERT := deploy/caddy/certs/dev.crt
LOCAL_EDGE_KEY := deploy/caddy/certs/dev.key

# Compose engine: unset COMPOSE → auto-detect (prefer Podman); env/CLI override wins.
# Empty COMPOSE is an error. Export so nested $(MAKE) keeps the same engine/wait flags.
# Shared-host / Rocky image-pin deploys use ./deploy.sh (not Make).
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
# local-edge (auth + HTTPS proxy) is enabled only on up/down/reinstall, not db-up/redis-up.
COMPOSE_LOCAL_EDGE := COMPOSE_PROFILES=local-edge

.PHONY: help install up down reinstall reinstall-keep-data db-up db-down db-wait redis-up redis-down redis-wait backend-dev frontend-dev backend-install frontend-install auth-install local-certs lint test test-ci backend-lint backend-test frontend-lint frontend-test auth-lint auth-test e2e e2e-smoke models migrate seed clean clean-models clean-run

help: ## List available targets
	@echo "Untangled developer commands (run from repository root):"
	@echo "  Compose engine: $(COMPOSE) (override: make COMPOSE=\"docker compose\" <target>)"
	@echo "  Shared-host deploy: ./deploy.sh --api-image … --web-image …"
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: backend-install frontend-install auth-install ## Install backend, frontend, and auth dependencies

backend-install: ## Create backend venv and install locked dependencies
	@test -d $(BACKEND_VENV)/bin || $(PYTHON) -m venv $(BACKEND_VENV)
	$(BACKEND_PIP) install -U pip
	$(BACKEND_PIP) install -r $(BACKEND_DIR)/requirements.lock
	$(BACKEND_PIP) install -e $(BACKEND_DIR) --no-deps

frontend-install: ## Install frontend npm dependencies
	cd $(FRONTEND_DIR) && npm ci

auth-install: ## Install auth-service npm dependencies
	cd $(AUTH_DIR) && npm ci

$(LOCAL_EDGE_CERT) $(LOCAL_EDGE_KEY) &:
	@cert="$(LOCAL_EDGE_CERT)"; key="$(LOCAL_EDGE_KEY)"; \
	if [ -f "$$cert" ] && [ -f "$$key" ]; then exit 0; fi; \
	if [ -f "$$cert" ] || [ -f "$$key" ]; then \
		echo "ERROR: exactly one of $$cert / $$key exists." >&2; \
		echo "Copy the matching file or remove the orphan, then retry." >&2; \
		exit 1; \
	fi; \
	mkdir -p deploy/caddy/certs; \
	openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
		-keyout "$$key" -out "$$cert" \
		-subj "/CN=127.0.0.1" \
		-addext "subjectAltName=IP:127.0.0.1,DNS:localhost"; \
	echo "generated self-signed $$cert and $$key"

local-certs: $(LOCAL_EDGE_CERT) $(LOCAL_EDGE_KEY) ## Create self-signed proxy TLS files when both are missing

up: $(LOCAL_EDGE_CERT) $(LOCAL_EDGE_KEY) ## Build and start postgres + redis + api + web + local-edge proxy/auth
	$(COMPOSE_LOCAL_EDGE) $(COMPOSE) up -d --build $(COMPOSE_WAIT_FLAG)
ifneq ($(COMPOSE_SUPPORTS_WAIT),yes)
	@$(MAKE) db-wait
	@$(MAKE) redis-wait
endif

down: ## Stop Compose runtime (keeps named DB volume; Redis is ephemeral)
	$(COMPOSE_LOCAL_EDGE) $(COMPOSE) down

# Full local reset: wipe named volumes (Postgres), bring stack back, migrate, seed.
# Redis has no named volume — restart always starts empty. Optional:
# WITH_HOST_INSTALL=1 also runs `make install` after teardown.
reinstall: ## Wipe DB volume, restart stack, migrate, and seed
	$(COMPOSE_LOCAL_EDGE) $(COMPOSE) down -v --remove-orphans
ifeq ($(WITH_HOST_INSTALL),1)
	$(MAKE) install
endif
	$(MAKE) up migrate seed
	@echo "==> Reinstall complete"
	@echo "    Proxy (browser origin, interim HTTPS): https://127.0.0.1:8443"
	@echo "    Web (host-dev / Playwright): http://127.0.0.1:5173"
	@echo "    API: http://127.0.0.1:8000"

reinstall-keep-data: ## Restart stack without wiping DB volume, then migrate and seed
	$(MAKE) down
ifeq ($(WITH_HOST_INSTALL),1)
	$(MAKE) install
endif
	$(MAKE) up migrate seed
	@echo "==> Reinstall complete"
	@echo "    Proxy (browser origin, interim HTTPS): https://127.0.0.1:8443"
	@echo "    Web (host-dev / Playwright): http://127.0.0.1:5173"
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

redis-up: ## Start containerized Redis only (for host-run bus / cache work)
	$(COMPOSE) up -d redis
	@$(MAKE) redis-wait

redis-down: ## Stop the Compose Redis service
	$(COMPOSE) stop redis

redis-wait: ## Wait until Redis accepts connections
	@echo "waiting for Redis..."; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if $(COMPOSE) exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then \
			echo "Redis is ready"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Redis did not become ready in time"; \
	exit 1

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
	@mkdir -p $(RUN_DIR)/audit
	UNTANGLED_AUDIT_LOG_DIR=$${UNTANGLED_AUDIT_LOG_DIR:-$(CURDIR)/$(RUN_DIR)/audit} \
		$(BACKEND_PYTHON) -m untangled.schema $(MIGRATE_ARGS)

seed: backend-install ## Idempotent local user seed (intentional; after migrate; not part of up)
	@mkdir -p $(RUN_DIR)/audit
	UNTANGLED_AUDIT_LOG_DIR=$${UNTANGLED_AUDIT_LOG_DIR:-$(CURDIR)/$(RUN_DIR)/audit} \
		$(BACKEND_PYTHON) -m untangled.seed

lint: backend-lint frontend-lint auth-lint ## Run backend, frontend, and auth lint checks

test: backend-test frontend-test auth-test ## Run backend, frontend, and auth tests

# Same leaf checks as lint + test. Skips Compose db-up / redis-up — Postgres and
# Redis must already be reachable (e.g. Actions service containers).
test-ci: ## Lint + test without Compose db-up/redis-up (services must already be up)
	$(MAKE) lint
	$(MAKE) SKIP_DB_UP=1 SKIP_REDIS_UP=1 test

backend-lint: backend-install ## Lint backend Python sources
	$(BACKEND_VENV)/bin/ruff check $(BACKEND_DIR)/src $(BACKEND_DIR)/tests

# SKIP_DB_UP=1: assume PostgreSQL is already reachable (CI service container).
# SKIP_REDIS_UP=1: assume Redis is already reachable (CI service container).
backend-test: backend-install frontend-install ## Run backend pytest suite (includes DB-backed persistence tests)
ifneq ($(SKIP_DB_UP),1)
	@$(MAKE) db-up
endif
ifneq ($(SKIP_REDIS_UP),1)
	@$(MAKE) redis-up
endif
	PYTHONPATH=$(BACKEND_DIR)/src $(BACKEND_PYTHON) -m pytest $(BACKEND_DIR)

frontend-lint: frontend-install models ## Typecheck the frontend (minimal lint until ESLint is added)
	# CI=1: react-router typegen ignores vite clearScreen and wipes TTY scrollback otherwise
	cd $(FRONTEND_DIR) && CI=1 npm run typecheck

frontend-test: frontend-install models ## Run frontend unit tests and SSR production build smoke
	cd $(FRONTEND_DIR) && CI=1 npm test
	cd $(FRONTEND_DIR) && CI=1 npm run build

auth-lint: auth-install ## Typecheck the auth service
	cd $(AUTH_DIR) && npm run typecheck

auth-test: auth-install ## Run auth-service unit tests
	cd $(AUTH_DIR) && npm test

# Playwright browser E2E. Requires a live web+API stack (e.g. make up && make migrate && make seed)
# or host-dev API on :8000 + web on :5173. Does not start services.
e2e: frontend-install ## Run full Playwright suite against PLAYWRIGHT_BASE_URL (default :5173)
	cd $(FRONTEND_DIR) && npx playwright test

e2e-smoke: frontend-install ## Run Playwright @smoke suite (CI gate)
	cd $(FRONTEND_DIR) && npx playwright test --grep @smoke

clean-models: ## Remove generated Pydantic/Zod artefacts
	rm -rf $(BACKEND_DIR)/src/untangled/generated $(FRONTEND_DIR)/app/generated

clean: clean-models ## Remove generated artefacts (leave a clean source tree)

clean-run: ## Remove leftover local run logs and pid files (legacy host up path)
	rm -rf $(RUN_DIR)
