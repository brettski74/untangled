"""Domain record HTTP package: registry-driven ``/api/v2`` mounts."""

from __future__ import annotations

from untangled.records.deps import ensure_generated_package
from untangled.records.v2_mounts import build_v2_record_routers

ensure_generated_package()

v2_record_routers = build_v2_record_routers()

__all__ = [
    "v2_record_routers",
]
