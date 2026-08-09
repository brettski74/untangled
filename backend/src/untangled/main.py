"""FastAPI application entrypoint.

Replace or extend this module in place as domain APIs, auth, and database
layers land in later M1 tickets. Do not introduce a second application entry.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from untangled.audit.deps import set_audit_logger
from untangled.audit.file_sink import FileAuditLogger
from untangled.audit.middleware import AuditCorrelationMiddleware
from untangled.auth import auth_router
from untangled.coherence import start_system_config_subscriber
from untangled.records.mounts import v2_record_routers
from untangled.request_validation import register_request_validation_handlers


def _wire_audit_logger() -> FileAuditLogger:
    logger = FileAuditLogger()
    set_audit_logger(logger)
    return logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = _wire_audit_logger()
    app.state.audit_logger = logger
    # Bus-dependent: fail loud if Redis is missing/unreachable (no silent no-op).
    stop_coherence = start_system_config_subscriber()
    try:
        yield
    finally:
        stop_coherence()
        logger.close()


app = FastAPI(
    title="Untangled ITSM",
    description=(
        "Backend API for Milestone 1. Public domain record CRUD uses path "
        "versions under /api/v{major}. /api/v2/{class_name} is the sole record "
        "collection contract (path tracks live class name; no pluralization)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)
# Eager wire so TestClient without lifespan still has a logger (tests may override).
_wire_audit_logger()
app.add_middleware(AuditCorrelationMiddleware)
register_request_validation_handlers(app)
app.include_router(auth_router)
for _v2_router in v2_record_routers:
    app.include_router(_v2_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Smoke-test endpoint until domain APIs exist."""
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Minimal root response for local smoke checks."""
    return {"service": "untangled-backend", "status": "ok"}
