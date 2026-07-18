.DEFAULT_GOAL := help

BACKEND_DIR := backend
FRONTEND_DIR := frontend
RUN_DIR := .run
PYTHON ?= python3
BACKEND_VENV := $(BACKEND_DIR)/.venv
BACKEND_PYTHON := $(BACKEND_VENV)/bin/python
BACKEND_PIP := $(BACKEND_VENV)/bin/pip
BACKEND_PID := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid

.PHONY: help install up down backend-dev frontend-dev backend-install frontend-install lint test backend-lint backend-test frontend-lint frontend-test models clean-run

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

up: install ## Start backend and frontend dev processes (local scaffold only)
	@mkdir -p $(RUN_DIR)
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
		echo "backend already running (pid $$(cat $(BACKEND_PID)))"; \
	else \
		$(BACKEND_VENV)/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000 \
			> $(RUN_DIR)/backend.log 2>&1 & echo $$! > $(BACKEND_PID); \
		echo "backend started on http://127.0.0.1:8000 (pid $$(cat $(BACKEND_PID)))"; \
	fi
	@if [ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null; then \
		echo "frontend already running (pid $$(cat $(FRONTEND_PID)))"; \
	else \
		( cd $(FRONTEND_DIR) && npm run dev -- --host 127.0.0.1 --port 5173 ) \
			> $(RUN_DIR)/frontend.log 2>&1 & echo $$! > $(FRONTEND_PID); \
		echo "frontend started on http://127.0.0.1:5173 (pid $$(cat $(FRONTEND_PID)))"; \
	fi
	@echo "Compose-based runtime is a later ticket; this target starts local dev processes only."

down: ## Stop backend and frontend dev processes started by make up
	@for name in backend frontend; do \
		pidfile="$(RUN_DIR)/$$name.pid"; \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile"); \
			if kill -0 "$$pid" 2>/dev/null; then \
				kill "$$pid" 2>/dev/null || true; \
				echo "stopped $$name (pid $$pid)"; \
			else \
				echo "$$name not running (stale pid $$pid)"; \
			fi; \
			rm -f "$$pidfile"; \
		else \
			echo "$$name not running (no pid file)"; \
		fi; \
	done

backend-dev: backend-install ## Run the FastAPI dev server in the foreground
	$(BACKEND_VENV)/bin/uvicorn untangled.main:app --reload --host 127.0.0.1 --port 8000

frontend-dev: frontend-install ## Run the React Router dev server in the foreground
	cd $(FRONTEND_DIR) && npm run dev -- --host 127.0.0.1 --port 5173

models: backend-install ## Generate Pydantic and Zod models from YAML class definitions
	$(BACKEND_PYTHON) -m untangled.mapping

lint: backend-lint frontend-lint ## Run backend and frontend lint checks

test: backend-test frontend-test ## Run backend and frontend tests

backend-lint: backend-install ## Lint backend Python sources
	$(BACKEND_VENV)/bin/ruff check $(BACKEND_DIR)/src $(BACKEND_DIR)/tests

backend-test: backend-install frontend-install ## Run backend pytest suite
	PYTHONPATH=$(BACKEND_DIR)/src $(BACKEND_PYTHON) -m pytest $(BACKEND_DIR)

frontend-lint: frontend-install ## Typecheck the frontend (minimal lint until ESLint is added)
	cd $(FRONTEND_DIR) && npm run typecheck

frontend-test: frontend-install ## Smoke-test frontend SSR production build
	cd $(FRONTEND_DIR) && npm run build

clean-run: ## Remove local run logs and pid files
	rm -rf $(RUN_DIR)
