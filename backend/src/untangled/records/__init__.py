"""Domain record HTTP package: Incident, Change Request, System Config.

Router construction lives in ``untangled.records.mounts`` so importing
``untangled.records.deps`` (e.g. from system-config helpers) does not pull
router factories and create an import cycle with coherence.
"""

from __future__ import annotations

__all__: list[str] = []
