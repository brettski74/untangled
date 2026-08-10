"""Registry-driven ``/api/v2`` record router mounts."""

from __future__ import annotations

from fastapi import APIRouter

from untangled.mapping.definition import STANDARD_PERMISSIONS
from untangled.mapping.registry import definitions_by_name
from untangled.records.v2_router_factory import build_v2_class_router


def build_v2_record_routers() -> list[APIRouter]:
    """Mount one v2 router per class that declares at least one standard op.

    Path segment is the live class ``name`` exactly as loaded (singular; no
    pluralization map). Classes with no standard permissions are omitted.
    """
    routers: list[APIRouter] = []
    for definition in sorted(
        definitions_by_name().values(), key=lambda d: d.name_snake
    ):
        if not STANDARD_PERMISSIONS.intersection(definition.permissions):
            continue
        name = definition.name_snake
        routers.append(
            build_v2_class_router(
                class_name=name,
                prefix=f"/api/v2/{name}",
                tags=[f"{name}-v2"],
            )
        )
    return routers
