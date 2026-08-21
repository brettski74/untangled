"""Cookie xor Bearer and cookie-auth CSRF/Origin on the Python domain API."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for, mint_access_token
from psycopg import Connection

from untangled.audit.deps import set_audit_logger
from untangled.audit.testing import ConditionalFailAuditLogger, RecordingAuditLogger
from untangled.audit.types import EventType
from untangled.auth.settings import ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME
from untangled.auth.tokens import PASSWORD_CHANGE_REQUIRED_ERROR
from untangled.main import app
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.seed.tickets import SEED_INCIDENT_1_ID
from untangled.seed.users import SEED_USERS

PUBLIC_ORIGIN = "https://localhost:8443"
_CSRF = "csrf-test-token"


@pytest.fixture
def api_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    recorder = RecordingAuditLogger()
    with TestClient(app) as client:
        set_audit_logger(recorder)
        yield client
    set_audit_logger(RecordingAuditLogger())


def _token(username: str = "readonly") -> str:
    return bearer_for(username)


def _expired_token(username: str = "readonly") -> str:
    seed = next(s for s in SEED_USERS if s.username == username)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    return mint_access_token(seed.id, now=past, ttl_seconds=1)


def _must_change_token() -> str:
    return mint_access_token(
        SEED_USERS[0].id,
        extra={"password_change_required": True},
    )


def _recorder() -> RecordingAuditLogger:
    from untangled.audit.deps import get_audit_logger

    logger = get_audit_logger()
    assert isinstance(logger, RecordingAuditLogger)
    return logger


def _cookie_unsafe_headers(
    token: str,
    *,
    csrf: str = _CSRF,
    origin: str = PUBLIC_ORIGIN,
) -> dict[str, str]:
    return {
        "Origin": origin,
        "X-CSRF-Token": csrf,
        "Cookie": f"{ACCESS_COOKIE_NAME}={token}; {CSRF_COOKIE_NAME}={csrf}",
    }


def _incident_get(token: str | None = None) -> str:
    return f"/api/v2/incident/{SEED_INCIDENT_1_ID}"


def test_dual_cookie_and_bearer_is_400_without_jwt_inspection(
    api_client: TestClient,
) -> None:
    response = api_client.get(
        _incident_get(),
        headers={
            "Authorization": "Bearer not-a-jwt",
            "Cookie": f"{ACCESS_COOKIE_NAME}=also-not-a-jwt",
        },
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Bad request"}
    assert "retry" not in response.json()

    expired = _expired_token()
    retry_shaped = api_client.get(
        _incident_get(),
        headers={
            "Authorization": f"Bearer {expired}",
            "Cookie": f"{ACCESS_COOKIE_NAME}={expired}",
        },
    )
    assert retry_shaped.status_code == 400
    assert "retry" not in retry_shaped.json()


def test_bearer_only_get_succeeds_without_cookies(api_client: TestClient) -> None:
    token = _token()
    response = api_client.get(
        _incident_get(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(SEED_INCIDENT_1_ID)


def test_cookie_only_get_succeeds_without_csrf(api_client: TestClient) -> None:
    token = _token()
    response = api_client.get(
        _incident_get(),
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(SEED_INCIDENT_1_ID)


def test_whitespace_presentations_count_as_absent(api_client: TestClient) -> None:
    token = _token()
    response = api_client.get(
        _incident_get(),
        headers={
            "Authorization": f"Bearer {token}",
            "Cookie": f"{ACCESS_COOKIE_NAME}=   ",
        },
    )
    assert response.status_code == 200, response.text


def test_refresh_cookie_is_not_a_credential(api_client: TestClient) -> None:
    response = api_client.get(
        _incident_get(),
        headers={"Cookie": "__untangled_refresh=opaque-refresh"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["detail"] == "Could not validate credentials"
    assert "retry" not in body


def test_missing_token_is_hard_401(api_client: TestClient) -> None:
    response = api_client.get(_incident_get())
    assert response.status_code == 401
    body = response.json()
    assert body["detail"] == "Could not validate credentials"
    assert "retry" not in body


def test_expired_single_method_is_retry_401(api_client: TestClient) -> None:
    expired = _expired_token()
    bearer = api_client.get(
        _incident_get(),
        headers={"Authorization": f"Bearer {expired}"},
    )
    cookie = api_client.get(
        _incident_get(),
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={expired}"},
    )
    for response in (bearer, cookie):
        assert response.status_code == 401
        body = response.json()
        assert body["detail"] == "Could not validate credentials"
        assert body.get("retry") is True


def test_cookie_and_bearer_share_rbac_outcome(api_client: TestClient) -> None:
    token = _token("readonly")
    search_body = {
        "attributes": ["summary"],
        "predicate": None,
        "limit": 1,
        "offset": 0,
    }
    bearer = api_client.post(
        "/api/v2/incident/search",
        headers={"Authorization": f"Bearer {token}"},
        json=search_body,
    )
    cookie = api_client.post(
        "/api/v2/incident/search",
        headers=_cookie_unsafe_headers(token),
        json=search_body,
    )
    assert bearer.status_code == 200, bearer.text
    assert cookie.status_code == 200, cookie.text
    assert bearer.json()["total"] == cookie.json()["total"]

    denied_bearer = api_client.patch(
        _incident_get(),
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "in-progress"},
    )
    denied_cookie = api_client.patch(
        _incident_get(),
        headers=_cookie_unsafe_headers(token),
        json={"status": "in-progress"},
    )
    assert denied_bearer.status_code == 403
    assert denied_cookie.status_code == 403
    assert denied_bearer.json() == denied_cookie.json()


def test_cookie_unsafe_requires_origin_and_csrf(api_client: TestClient) -> None:
    token = _token()
    search_body = {"attributes": ["summary"], "predicate": None}
    missing = api_client.post(
        "/api/v2/incident/search",
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
        json=search_body,
    )
    assert missing.status_code == 403
    assert missing.json() == {"detail": "Forbidden"}
    assert "retry" not in missing.json()

    events = [e for e in _recorder().events if e.event_type == EventType.AUTH_CSRF_DENIED]
    assert len(events) == 1
    assert events[0].reason == "origin_mismatch"
    assert events[0].data["csrf_header_length"] == 0
    assert events[0].data["csrf_cookie_length"] == 0
    assert events[0].user_id is None
    blob = str(events[0].data)
    assert _CSRF not in blob
    assert token not in blob


def test_cookie_csrf_mismatch_emits_csrf_mismatch(api_client: TestClient) -> None:
    token = _token()
    response = api_client.post(
        "/api/v2/incident/search",
        headers={
            "Origin": PUBLIC_ORIGIN,
            "X-CSRF-Token": "wrong-header",
            "Cookie": (f"{ACCESS_COOKIE_NAME}={token}; {CSRF_COOKIE_NAME}={_CSRF}"),
        },
        json={"attributes": ["summary"], "predicate": None},
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden"}
    events = [e for e in _recorder().events if e.event_type == EventType.AUTH_CSRF_DENIED]
    assert len(events) == 1
    assert events[0].reason == "csrf_mismatch"
    assert events[0].data["csrf_header_length"] == len("wrong-header")
    assert events[0].data["csrf_cookie_length"] == len(_CSRF)
    assert "wrong-header" not in str(events[0].data.values())
    assert _CSRF not in str(events[0].data.values())


def test_cookie_csrf_emit_throw_is_500_not_403(api_client: TestClient) -> None:
    set_audit_logger(
        ConditionalFailAuditLogger(lambda e: e.event_type == EventType.AUTH_CSRF_DENIED)
    )
    token = _token()
    response = api_client.post(
        "/api/v2/incident/search",
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
        json={"attributes": ["summary"], "predicate": None},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "Audit logging failed"}


def test_bearer_unsafe_skips_csrf(api_client: TestClient) -> None:
    token = _token()
    response = api_client.post(
        "/api/v2/incident/search",
        headers={"Authorization": f"Bearer {token}"},
        json={"attributes": ["summary"], "predicate": None},
    )
    assert response.status_code == 200, response.text
    assert not any(e.event_type == EventType.AUTH_CSRF_DENIED for e in _recorder().events)


def test_cookie_options_skips_csrf(api_client: TestClient) -> None:
    token = _token()
    response = api_client.options(
        _incident_get(),
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
    )
    assert response.status_code != 403


def test_must_change_cookie_or_bearer_is_403(api_client: TestClient) -> None:
    token = _must_change_token()
    search_body = {"attributes": ["summary"], "predicate": None}
    bearer = api_client.post(
        "/api/v2/incident/search",
        headers={"Authorization": f"Bearer {token}"},
        json=search_body,
    )
    cookie = api_client.post(
        "/api/v2/incident/search",
        headers=_cookie_unsafe_headers(token),
        json=search_body,
    )
    for response in (bearer, cookie):
        assert response.status_code == 403
        body = response.json()
        assert body["detail"]["error"] == PASSWORD_CHANGE_REQUIRED_ERROR
        assert "retry" not in body

    allowed = api_client.get(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
    )
    assert allowed.status_code == 200, allowed.text


def test_cookie_csrf_denial_does_not_mutate(api_client: TestClient) -> None:
    token = bearer_for("admin")
    before = api_client.get(
        _incident_get(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert before.status_code == 200
    status_before = before.json()["status"]
    denied = api_client.patch(
        _incident_get(),
        headers={"Cookie": f"{ACCESS_COOKIE_NAME}={token}"},
        json={"status": "in-progress"},
    )
    assert denied.status_code == 403
    after = api_client.get(
        _incident_get(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert after.json()["status"] == status_before
