"""Audit event payload."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from untangled.audit.types import ActorChannel, Outcome, Severity
from untangled.mapping.datetime_utc import utc_now


@dataclass(frozen=True, slots=True)
class AuditEvent:
    """One security/access audit event (JSON-serializable)."""

    event_type: str
    actor_channel: ActorChannel
    outcome: Outcome
    reason: str
    severity: Severity
    correlation_id: str
    user_id: UUID | None = None
    ip_address: str | None = None
    timestamp: datetime = field(default_factory=utc_now)
    data: dict[str, Any] = field(default_factory=dict)

    def to_json_dict(self) -> dict[str, Any]:
        """Stable JSON object for NDJSON sinks (no secrets expected in ``data``)."""
        payload = asdict(self)
        payload["actor_channel"] = self.actor_channel.value
        payload["outcome"] = self.outcome.value
        payload["severity"] = self.severity.value
        payload["timestamp"] = self.timestamp.isoformat().replace("+00:00", "Z")
        if self.user_id is not None:
            payload["user_id"] = str(self.user_id)
        else:
            payload["user_id"] = None
        return payload
