"""Audit logger protocol."""

from __future__ import annotations

from typing import Protocol

from untangled.audit.event import AuditEvent


class AuditLogger(Protocol):
    """Pluggable audit sink. ``emit`` must raise if durable write fails."""

    def emit(self, event: AuditEvent) -> None:
        """Durably record ``event`` or raise."""
