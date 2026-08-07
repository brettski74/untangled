"""Emit helpers: fail-closed vs best-effort."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from untangled.audit.context import get_correlation_id
from untangled.audit.deps import get_audit_logger
from untangled.audit.event import AuditEvent
from untangled.audit.types import ActorChannel, Outcome, Severity

_LOG = logging.getLogger("untangled.audit")


def emit_fail_closed(event: AuditEvent) -> None:
    """Write ``event`` or raise (caller must not complete the action)."""
    get_audit_logger().emit(event)


def emit_best_effort(event: AuditEvent) -> None:
    """Write ``event``; on failure log and continue."""
    try:
        get_audit_logger().emit(event)
    except Exception as exc:
        _LOG.error(
            "best-effort audit emit failed event_type=%s err=%s",
            event.event_type,
            exc,
        )


def make_event(
    *,
    event_type: str,
    actor_channel: ActorChannel,
    outcome: Outcome,
    reason: str,
    severity: Severity,
    user_id: UUID | None = None,
    ip_address: str | None = None,
    correlation_id: str | None = None,
    data: dict[str, Any] | None = None,
) -> AuditEvent:
    return AuditEvent(
        event_type=event_type,
        actor_channel=actor_channel,
        outcome=outcome,
        reason=reason,
        severity=severity,
        correlation_id=correlation_id or get_correlation_id(),
        user_id=user_id,
        ip_address=ip_address,
        data=data or {},
    )
