"""Eagerly constructed class routers for app mounting.

Kept separate from ``untangled.records`` package init so importing
``untangled.records.deps`` (e.g. from system-config helpers) does not pull
router factories and create an import cycle.
"""

from __future__ import annotations

from untangled.records.deps import ensure_generated_package
from untangled.records.v2_mounts import build_v2_record_routers

ensure_generated_package()

v2_record_routers = build_v2_record_routers()

__all__ = [
    "v2_record_routers",
]
