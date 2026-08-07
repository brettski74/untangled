"""Recording / failing audit loggers for tests."""

from __future__ import annotations

from untangled.audit.event import AuditEvent
from untangled.audit.file_sink import AuditWriteError


class RecordingAuditLogger:
    """Capture events in memory (tests)."""

    def __init__(self) -> None:
        self.events: list[AuditEvent] = []

    def emit(self, event: AuditEvent) -> None:
        self.events.append(event)


class FailingAuditLogger:
    """Always raise on emit (tests)."""

    def emit(self, event: AuditEvent) -> None:
        raise AuditWriteError("injected audit failure")


class ConditionalFailAuditLogger:
    """Fail when ``should_fail(event)`` is true; otherwise record."""

    def __init__(self, should_fail) -> None:
        self.should_fail = should_fail
        self.events: list[AuditEvent] = []

    def emit(self, event: AuditEvent) -> None:
        if self.should_fail(event):
            raise AuditWriteError("injected conditional audit failure")
        self.events.append(event)
