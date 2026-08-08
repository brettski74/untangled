"""FastAPI application entrypoint.

Replace or extend this module in place as domain APIs, auth, and database
layers land in later M1 tickets. Do not introduce a second application entry.
"""

from fastapi import FastAPI

from untangled.auth import auth_router
from untangled.records import (
    change_requests_router,
    change_requests_v1_router,
    incidents_router,
    incidents_v1_router,
    system_configs_router,
    system_configs_v1_router,
    v2_record_routers,
)
from untangled.request_validation import register_request_validation_handlers

app = FastAPI(
    title="Untangled ITSM",
    description=(
        "Backend API for Milestone 1. Public domain contracts that change use "
        "path versions under /api/v{major}. /api/v2 is a versioned record "
        "contract (path tracks live class name; spelling follows identity "
        "rename); FE is not cut over to v2 yet. Unversioned /incidents, "
        "/change-requests, and /system-configs routes are pre-versioning "
        "legacy compatibility surfaces (removal tracked by GitHub issue #117 "
        "and epic #150). /api/v1 remains the live in-app read/update contract "
        "until FE cutover."
    ),
    version="0.1.0",
)
register_request_validation_handlers(app)
app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(change_requests_router)
app.include_router(system_configs_router)
app.include_router(incidents_v1_router)
app.include_router(change_requests_v1_router)
app.include_router(system_configs_v1_router)
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
