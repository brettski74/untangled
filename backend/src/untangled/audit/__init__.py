"""Auditable access / security event logging (pluggable sink; MVP file NDJSON)."""

from untangled.audit.deps import get_audit_logger, set_audit_logger
from untangled.audit.event import AuditEvent
from untangled.audit.logger import AuditLogger
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity

__all__ = [
    "ActorChannel",
    "AuditEvent",
    "AuditLogger",
    "EventType",
    "Outcome",
    "Severity",
    "get_audit_logger",
    "set_audit_logger",
]
