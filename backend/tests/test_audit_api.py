"""API-level audit emission and fail-closed behaviour."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection, sql

from untangled.audit.deps import get_audit_logger, set_audit_logger
from untangled.audit.event import AuditEvent
from untangled.audit.file_sink import AuditWriteError, FileAuditLogger
from untangled.audit.testing import (
    ConditionalFailAuditLogger,
    FailingAuditLogger,
    RecordingAuditLogger,
)
from untangled.audit.types import ActorChannel, EventType
from untangled.audit.volume import reset_bulk_read_state_for_tests
from untangled.main import app
from untangled.seed import seed_all
from untangled.seed.rbac import seed_rbac
from untangled.system_config.cache import default_cache

# Matches password-strength defaults used by change-password tests.
_STRONG_NEW = "orchid-lantern-quasar-7N!pQ2xm"


@pytest.fixture
def client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    seed_all(db_conn)
    db_conn.commit()
    reset_bulk_read_state_for_tests()
    # Lifespan wires FileAuditLogger; install the recorder after it starts.
    with TestClient(app) as test_client:
        recorder = RecordingAuditLogger()
        set_audit_logger(recorder)
        yield test_client
    set_audit_logger(RecordingAuditLogger())


def _login(client: TestClient, username: str = "admin", password: str = "admin-change-me"):
    return client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def _token(username: str = "admin") -> str:
    return bearer_for(username)


def _incident_body() -> dict:
    return {"summary": "audit-test", "status": "new", "severity": "Low"}


def _recorder() -> RecordingAuditLogger:
    logger = get_audit_logger()
    assert isinstance(logger, RecordingAuditLogger)
    return logger


def _assert_no_secrets(events: list[AuditEvent]) -> None:
    for event in events:
        blob = f"{event.data!s} {event.reason} {event.event_type}".lower()
        assert "password" not in str(event.data).lower()
        assert "bearer ey" not in blob
        assert "refresh_token" not in str(event.data).lower()
        for value in event.data.values():
            if isinstance(value, str):
                assert not value.startswith("eyJ")
                assert "admin-change-me" not in value
                assert _STRONG_NEW not in value


def test_python_login_and_refresh_are_unregistered(client: TestClient) -> None:
    recorder = _recorder()
    recorder.events.clear()
    expected = client.post("/auth/no-such-route").json()
    bad = _login(client, password="wrong")
    assert bad.status_code == 404
    assert bad.json() == expected
    ok = _login(client)
    assert ok.status_code == 404
    refresh = client.post("/auth/refresh", json={"refresh_token": "x"})
    assert refresh.status_code == 404
    assert "api/v2/auth/login" not in bad.text
    assert not any(e.event_type == EventType.AUTH_LOGIN for e in recorder.events)
    assert not any(e.event_type == EventType.AUTH_REFRESH for e in recorder.events)


def test_auth_logout_password_and_correlation(client: TestClient) -> None:
    """Logout, password-change, and correlation-id on one client lifespan."""
    recorder = _recorder()
    cid = "manual-correlation-test-001"
    recorder.events.clear()
    logout = client.post(
        "/auth/logout",
        json={"refresh_token": "not-a-real-token"},
        headers={"X-Correlation-Id": cid},
    )
    assert logout.status_code == 204
    assert logout.headers.get("X-Correlation-Id") == cid
    logout_events = [e for e in recorder.events if e.event_type == EventType.AUTH_LOGOUT]
    assert logout_events and all(e.correlation_id == cid for e in logout_events)
    assert any(e.reason == "logout_idempotent" for e in logout_events)

    access = _token()
    headers = {"Authorization": f"Bearer {access}"}
    recorder.events.clear()
    failed = client.post(
        "/auth/change-password",
        headers=headers,
        json={
            "current_password": "wrong",
            "new_password": _STRONG_NEW,
            "verify_new_password": _STRONG_NEW,
        },
    )
    assert failed.status_code == 422
    ok = client.post(
        "/auth/change-password",
        headers=headers,
        json={
            "current_password": "admin-change-me",
            "new_password": _STRONG_NEW,
            "verify_new_password": _STRONG_NEW,
        },
    )
    assert ok.status_code == 200
    assert any(
        e.event_type == EventType.AUTH_PASSWORD_CHANGE and e.outcome.value == "failure"
        for e in recorder.events
    )
    assert any(
        e.event_type == EventType.AUTH_PASSWORD_CHANGE and e.outcome.value == "success"
        for e in recorder.events
    )
    _assert_no_secrets(recorder.events)


def test_login_unregistered_even_when_audit_logger_fails(
    demo_schema, db_conn: Connection
) -> None:
    seed_all(db_conn)
    db_conn.commit()
    with TestClient(app) as client:
        set_audit_logger(FailingAuditLogger())
        response = _login(client)
        assert response.status_code == 404
    set_audit_logger(RecordingAuditLogger())


def test_record_access_denials_and_crud_emit(client: TestClient) -> None:
    """Authn/authz denials plus search/fetch/create/update/delete success events."""
    recorder = _recorder()
    recorder.events.clear()

    unauth = client.post(
        "/api/v2/incident/search",
        headers={"Authorization": "Bearer not-a-jwt"},
        json={},
    )
    assert unauth.status_code == 401
    assert any(
        e.event_type == EventType.RECORD_AUTHN_DENIED and e.outcome.value == "failure"
        for e in recorder.events
    )

    recorder.events.clear()
    ro_headers = {"Authorization": f"Bearer {_token('readonly')}"}
    forbidden = client.post("/api/v2/incident", headers=ro_headers, json=_incident_body())
    assert forbidden.status_code == 403
    assert any(
        e.event_type == EventType.RECORD_AUTHZ_DENIED
        and e.data.get("class") == "incident"
        and e.data.get("operation") == "create"
        for e in recorder.events
    )

    # Seed an incident as admin for update/delete authz checks below.
    admin_token = _token()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    seed_incident = client.post(
        "/api/v2/incident", headers=admin_headers, json=_incident_body()
    )
    assert seed_incident.status_code == 201
    seed_locator = seed_incident.json()["id"]

    recorder.events.clear()
    update_denied = client.patch(
        f"/api/v2/incident/{seed_locator}",
        headers=ro_headers,
        json={"summary": "nope"},
    )
    assert update_denied.status_code == 403
    assert any(
        e.event_type == EventType.RECORD_AUTHZ_DENIED
        and e.data.get("class") == "incident"
        and e.data.get("operation") == "update"
        for e in recorder.events
    )

    readwrite = _token("readwrite")
    rw_headers = {"Authorization": f"Bearer {readwrite}"}
    recorder.events.clear()
    delete_denied = client.delete(f"/api/v2/incident/{seed_locator}", headers=rw_headers)
    assert delete_denied.status_code == 403
    assert any(
        e.event_type == EventType.RECORD_AUTHZ_DENIED
        and e.data.get("class") == "incident"
        and e.data.get("operation") == "delete"
        for e in recorder.events
    )

    headers = admin_headers
    recorder.events.clear()

    created = client.post("/api/v2/incident", headers=headers, json=_incident_body())
    assert created.status_code == 201
    locator = created.json()["id"]
    assert any(e.event_type == EventType.RECORD_CREATE for e in recorder.events)

    recorder.events.clear()
    assert client.get(f"/api/v2/incident/{locator}", headers=headers).status_code == 200
    assert any(
        e.event_type == EventType.RECORD_FETCH and e.data.get("locator") == locator
        for e in recorder.events
    )

    recorder.events.clear()
    assert client.post("/api/v2/incident/search", headers=headers, json={}).status_code == 200
    assert any(e.event_type == EventType.RECORD_SEARCH for e in recorder.events)

    recorder.events.clear()
    assert (
        client.patch(
            f"/api/v2/incident/{locator}",
            headers=headers,
            json={"summary": "audit-test-updated"},
        ).status_code
        == 200
    )
    assert any(e.event_type == EventType.RECORD_UPDATE for e in recorder.events)

    recorder.events.clear()
    assert client.delete(f"/api/v2/incident/{locator}", headers=headers).status_code == 204
    assert any(
        e.event_type == EventType.RECORD_DELETE and e.data.get("locator") == locator
        for e in recorder.events
    )
    assert client.get(f"/api/v2/incident/{locator}", headers=headers).status_code == 404
    _assert_no_secrets(recorder.events)


def test_delete_fail_closed_prevents_delete(client: TestClient) -> None:
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/v2/incident", headers=headers, json=_incident_body())
    assert created.status_code == 201
    locator = created.json()["id"]
    set_audit_logger(
        ConditionalFailAuditLogger(
            lambda e: e.event_type == EventType.RECORD_DELETE
            and not e.data.get("compensate")
        )
    )
    deleted = client.delete(f"/api/v2/incident/{locator}", headers=headers)
    assert deleted.status_code == 500
    set_audit_logger(RecordingAuditLogger())
    still = client.get(f"/api/v2/incident/{locator}", headers=headers)
    assert still.status_code == 200


def test_update_fail_closed_restores_row(client: TestClient) -> None:
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/v2/incident", headers=headers, json=_incident_body())
    assert created.status_code == 201
    locator = created.json()["id"]
    set_audit_logger(
        ConditionalFailAuditLogger(lambda e: e.event_type == EventType.RECORD_UPDATE)
    )
    updated = client.patch(
        f"/api/v2/incident/{locator}",
        headers=headers,
        json={"summary": "should-not-stick"},
    )
    assert updated.status_code == 500
    set_audit_logger(RecordingAuditLogger())
    still = client.get(f"/api/v2/incident/{locator}", headers=headers)
    assert still.status_code == 200
    assert still.json()["summary"] == "audit-test"


def test_create_compensate_on_audit_failure(client: TestClient) -> None:
    """Create audit failure must compensate-delete the row (recovery, not fail-closed)."""
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    before = client.post("/api/v2/incident/search", headers=headers, json={})
    assert before.status_code == 200
    before_total = before.json()["total"]
    set_audit_logger(
        ConditionalFailAuditLogger(lambda e: e.event_type == EventType.RECORD_CREATE)
    )
    created = client.post("/api/v2/incident", headers=headers, json=_incident_body())
    assert created.status_code == 500
    set_audit_logger(RecordingAuditLogger())
    after = client.post("/api/v2/incident/search", headers=headers, json={})
    assert after.status_code == 200
    assert after.json()["total"] == before_total


def test_privilege_change_emits_on_seed(demo_schema, db_conn: Connection) -> None:
    # Seed outside app lifespan; wire recorder before RBAC upsert.
    recorder = RecordingAuditLogger()
    set_audit_logger(recorder)
    seed_all(db_conn)
    db_conn.commit()
    assert any(
        e.event_type == EventType.RBAC_PRIVILEGE_CHANGE
        and e.actor_channel != ActorChannel.HUMAN
        and e.outcome.value == "success"
        for e in recorder.events
    )
    set_audit_logger(RecordingAuditLogger())


def test_privilege_change_fail_closed_rolls_back(
    demo_schema, db_conn: Connection
) -> None:
    """RBAC seed must not commit privilege rows when fail-closed audit emit fails."""
    # demo_schema → ensure_stub_actor_user already ran seed_all; clear privilege
    # tables so a successful seed_rbac would insert, then prove audit failure rolls back.
    for table in ("user_role", "role_permission", "role", "permission"):
        db_conn.execute(
            sql.SQL("DELETE FROM {}").format(sql.Identifier(table))
        )
    db_conn.commit()
    assert db_conn.execute("SELECT count(*) FROM role").fetchone()[0] == 0

    set_audit_logger(FailingAuditLogger())
    with pytest.raises(AuditWriteError):
        seed_rbac(db_conn)
    assert db_conn.execute("SELECT count(*) FROM role").fetchone()[0] == 0
    set_audit_logger(RecordingAuditLogger())


def test_bulk_read_volume_signal(client: TestClient, db_conn: Connection) -> None:
    reset_bulk_read_state_for_tests()
    db_conn.execute(
        "UPDATE system_config SET audit_bulk_read_max_searches = 2, "
        "audit_bulk_read_window_seconds = 600"
    )
    db_conn.commit()
    default_cache.invalidate()
    recorder = _recorder()
    recorder.events.clear()
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(3):
        response = client.post("/api/v2/incident/search", headers=headers, json={})
        assert response.status_code == 200
    assert any(
        e.event_type == EventType.AUDIT_BULK_READ_VOLUME for e in recorder.events
    )


def test_app_wired_file_sink_writes_valid_ndjson(
    demo_schema,
    db_conn: Connection,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Lifespan FileAuditLogger appends parseable NDJSON (not a recording stub)."""
    seed_all(db_conn)
    db_conn.commit()
    audit_dir = tmp_path / "audit-ndjson"
    audit_dir.mkdir()
    monkeypatch.setenv("UNTANGLED_AUDIT_LOG_DIR", str(audit_dir))

    with TestClient(app) as client:
        logger = get_audit_logger()
        assert isinstance(logger, FileAuditLogger)
        assert getattr(client.app.state, "audit_logger", None) is logger
        token = bearer_for("admin")
        response = client.post(
            "/api/v2/incident/search",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Correlation-Id": "ndjson-wire-1",
            },
            json={},
        )
        assert response.status_code == 200

    files = sorted(audit_dir.glob("audit-*.ndjson"))
    assert files, "expected at least one NDJSON audit file under UNTANGLED_AUDIT_LOG_DIR"
    lines = [line for path in files for line in path.read_text(encoding="utf-8").splitlines()]
    assert lines
    payloads = [json.loads(line) for line in lines]
    required = (
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
    )
    for payload in payloads:
        for key in required:
            assert key in payload
        assert "password" not in json.dumps(payload).lower()
    assert any(
        p["event_type"] == EventType.RECORD_SEARCH
        and p["outcome"] == "success"
        and p["correlation_id"] == "ndjson-wire-1"
        for p in payloads
    )
    set_audit_logger(RecordingAuditLogger())
