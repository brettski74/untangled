"""Unit tests for the file audit sink and event shape."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest

from untangled.audit.event import AuditEvent
from untangled.audit.file_sink import AuditWriteError, FileAuditLogger
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity


def test_event_json_has_required_fields() -> None:
    event = AuditEvent(
        event_type=EventType.AUTH_LOGIN,
        actor_channel=ActorChannel.HUMAN,
        outcome=Outcome.SUCCESS,
        reason="login_ok",
        severity=Severity.INFO,
        correlation_id="cid-1",
        user_id=UUID("01900000-0000-7000-8000-000000000001"),
        ip_address="127.0.0.1",
        data={"username": "admin"},
    )
    payload = event.to_json_dict()
    for key in (
        "user_id",
        "actor_channel",
        "timestamp",
        "ip_address",
        "event_type",
        "reason",
        "outcome",
        "severity",
        "correlation_id",
        "data",
    ):
        assert key in payload
    assert payload["user_id"] == "01900000-0000-7000-8000-000000000001"
    assert "password" not in json.dumps(payload)


def test_file_sink_append_and_rollover_by_size(tmp_path: Path) -> None:
    logger = FileAuditLogger(tmp_path, rollover_bytes=80, rollover_seconds=86_400)
    for i in range(5):
        logger.emit(
            AuditEvent(
                event_type=EventType.RECORD_FETCH,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="fetch_ok",
                severity=Severity.INFO,
                correlation_id=f"c-{i}",
                data={"n": i, "pad": "x" * 40},
            )
        )
    logger.close()
    files = list(tmp_path.glob("audit-*.ndjson"))
    assert len(files) >= 2
    lines = []
    for path in files:
        lines.extend(path.read_text(encoding="utf-8").splitlines())
    assert len(lines) == 5
    assert all(json.loads(line)["event_type"] == EventType.RECORD_FETCH for line in lines)


def test_file_sink_rollover_by_time(tmp_path: Path) -> None:
    clock = {"t": 1_000.0}

    def now() -> float:
        return clock["t"]

    logger = FileAuditLogger(
        tmp_path, rollover_bytes=10_000_000, rollover_seconds=10, clock=now
    )
    logger.emit(
        AuditEvent(
            event_type=EventType.AUTH_LOGIN,
            actor_channel=ActorChannel.HUMAN,
            outcome=Outcome.SUCCESS,
            reason="login_ok",
            severity=Severity.INFO,
            correlation_id="a",
        )
    )
    clock["t"] = 1_020.0
    logger.emit(
        AuditEvent(
            event_type=EventType.AUTH_LOGIN,
            actor_channel=ActorChannel.HUMAN,
            outcome=Outcome.SUCCESS,
            reason="login_ok",
            severity=Severity.INFO,
            correlation_id="b",
        )
    )
    logger.close()
    assert len(list(tmp_path.glob("audit-*.ndjson"))) >= 2


def test_file_sink_raises_on_unwritable(tmp_path: Path) -> None:
    blocked = tmp_path / "blocked"
    blocked.mkdir()
    blocked.chmod(0o500)
    nested = blocked / "nope"
    logger = FileAuditLogger(nested)
    with pytest.raises(AuditWriteError):
        # Directory create under non-writable parent should fail.
        try:
            logger.emit(
                AuditEvent(
                    event_type=EventType.AUTH_LOGIN,
                    actor_channel=ActorChannel.HUMAN,
                    outcome=Outcome.SUCCESS,
                    reason="login_ok",
                    severity=Severity.INFO,
                    correlation_id="x",
                )
            )
        finally:
            blocked.chmod(0o700)
