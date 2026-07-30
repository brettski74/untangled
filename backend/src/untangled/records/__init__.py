"""Domain record HTTP package: Incident and Change Request CRUD."""

from __future__ import annotations

from untangled.records.deps import ensure_generated_package
from untangled.records.router_factory import build_class_router

ensure_generated_package()

incidents_router = build_class_router(
    class_kebab="incident",
    prefix="/incidents",
    tags=["incidents"],
    surface="legacy",
)
change_requests_router = build_class_router(
    class_kebab="change-request",
    prefix="/change-requests",
    tags=["change-requests"],
    surface="legacy",
)
incidents_v1_router = build_class_router(
    class_kebab="incident",
    prefix="/api/v1/incidents",
    tags=["incidents-v1"],
    surface="v1",
)
change_requests_v1_router = build_class_router(
    class_kebab="change-request",
    prefix="/api/v1/change-requests",
    tags=["change-requests-v1"],
    surface="v1",
)

__all__ = [
    "change_requests_router",
    "change_requests_v1_router",
    "incidents_router",
    "incidents_v1_router",
]
