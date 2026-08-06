"""Domain record HTTP package: Incident, Change Request, System Config."""

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
system_configs_router = build_class_router(
    class_kebab="system-config",
    prefix="/system-configs",
    tags=["system-configs"],
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
system_configs_v1_router = build_class_router(
    class_kebab="system-config",
    prefix="/api/v1/system-configs",
    tags=["system-configs-v1"],
    surface="v1",
)

__all__ = [
    "change_requests_router",
    "change_requests_v1_router",
    "incidents_router",
    "incidents_v1_router",
    "system_configs_router",
    "system_configs_v1_router",
]
