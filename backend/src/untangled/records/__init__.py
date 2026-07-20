"""Domain record HTTP package: Incident and Change Request CRUD."""

from __future__ import annotations

from untangled.records.deps import ensure_generated_package
from untangled.records.router_factory import build_class_router

ensure_generated_package()

incidents_router = build_class_router(
    class_kebab="incident",
    prefix="/incidents",
    tags=["incidents"],
)
change_requests_router = build_class_router(
    class_kebab="change-request",
    prefix="/change-requests",
    tags=["change-requests"],
)

__all__ = ["change_requests_router", "incidents_router"]
