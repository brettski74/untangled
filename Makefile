.DEFAULT_GOAL := help

BACKEND_DIR := backend
FRONTEND_DIR := frontend
RUN_DIR := .run
PYTHON ?= python3
BACKEND_VENV := $(BACKEND_DIR)/.venv
BACKEND_PYTHON := $(BACKEND_VENV)/bin/python
BACKEND_PIP := $(BACKEND_VENV)/bin/pip

COMPOSE ?= docker compose

.PHONY: help install up down db-up db-down db-wait backend-dev frontend-dev backend-install frontend-install lint test backend-lint backend-test frontend-lint frontend-test models migrate seed clean clean-models clean-run

help: ## List available targets
	@echo "Untangled developer commands (run from repository root):"
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
	$(COMPOSE) up -d --build --wait

down: ## Stop Compose runtime (keeps named DB volume)
	$(COMPOSE) down

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

backend-dev: backend-install ## Run the FastAPI dev server in the foreground (host hot-reload)
	$(BACKEND_VENV)/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000

frontend-dev: frontend-install ## Run the React Router dev server in the foreground (host hot-reload)
	cd $(FRONTEND_DIR) && npm run dev -- --host 127.0.0.1 --port 5173

models: backend-install ## Generate Pydantic and Zod models from YAML class definitions
	$(BACKEND_PYTHON) -m untangled.mapping

migrate: backend-install ## Apply YAML schema intent to PostgreSQL (intentional; not part of up)
	$(BACKEND_PYTHON) -m untangled.schema $(MIGRATE_ARGS)

seed: backend-install ## Idempotent local user seed (intentional; after migrate; not part of up)
	$(BACKEND_PYTHON) -m untangled.seed

lint: backend-lint frontend-lint ## Run backend and frontend lint checks

test: backend-test frontend-test ## Run backend and frontend tests

backend-lint: backend-install ## Lint backend Python sources
	$(BACKEND_VENV)/bin/ruff check $(BACKEND_DIR)/src $(BACKEND_DIR)/tests

backend-test: backend-install frontend-install db-up ## Run backend pytest suite (includes DB-backed persistence tests)
	PYTHONPATH=$(BACKEND_DIR)/src $(BACKEND_PYTHON) -m pytest $(BACKEND_DIR)

frontend-lint: frontend-install ## Typecheck the frontend (minimal lint until ESLint is added)
	# CI=1: react-router typegen ignores vite clearScreen and wipes TTY scrollback otherwise
	cd $(FRONTEND_DIR) && CI=1 npm run typecheck

frontend-test: frontend-install ## Smoke-test frontend SSR production build
	cd $(FRONTEND_DIR) && CI=1 npm run build

clean-models: ## Remove generated Pydantic/Zod artefacts
	rm -rf $(BACKEND_DIR)/src/untangled/generated $(FRONTEND_DIR)/app/generated

clean: clean-models ## Remove generated artefacts (leave a clean source tree)

clean-run: ## Remove leftover local run logs and pid files (legacy host up path)
	rm -rf $(RUN_DIR)
