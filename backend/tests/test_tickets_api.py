"""DB-backed tests for Incident / Change Request HTTP CRUD."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection

from untangled.main import app
from untangled.seed.tickets import SEED_INCIDENT_1_ID
from untangled.seed.users import SEED_USERS, password_for


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _login(client: TestClient, username: str, password: str):
    return client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def _bearer(client: TestClient, username: str) -> str:
    seed = next(s for s in SEED_USERS if s.username == username)
    login = _login(client, seed.username, password_for(seed))
    assert login.status_code == 200
    return login.json()["access_token"]


def _headers(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def test_incident_crud_uuid_and_friendly_locator(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/incidents",
        headers=headers,
        json={
            "summary": "Printer jam",
            "status": "new",
            "severity": "Low",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["number"].startswith("INC")
    assert body["summary"] == "Printer jam"
    assert "created_by" in body

    by_id = tickets_client.get(f"/incidents/{body['id']}", headers=headers)
    assert by_id.status_code == 200
    assert by_id.json()["number"] == body["number"]

    by_num = tickets_client.get(f"/incidents/{body['number']}", headers=headers)
    assert by_num.status_code == 200
    assert by_num.json()["id"] == body["id"]

    updated = tickets_client.patch(
        f"/incidents/{body['number']}",
        headers=headers,
        json={"status": "in-progress"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "in-progress"
    assert updated.json()["number"] == body["number"]

    # readwrite cannot delete
    denied = tickets_client.delete(f"/incidents/{body['id']}", headers=headers)
    assert denied.status_code == 403

    admin = _headers(tickets_client, "admin")
    deleted = tickets_client.delete(f"/incidents/{body['id']}", headers=admin)
    assert deleted.status_code == 204
    missing = tickets_client.get(f"/incidents/{body['id']}", headers=admin)
    assert missing.status_code == 404


def test_change_request_create_requires_schedule(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(days=1, hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Swap switch",
            "status": "draft",
            "scheduled_start": start,
            "scheduled_end": end,
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["number"].startswith("CHG")
    assert body["scheduled_start"] == start
    assert "." not in body["scheduled_start"]
    assert body["scheduled_start"].endswith("Z")
    assert "." not in body["created_at"]
    assert body["created_at"].endswith("Z")


def _schedule_error(detail: object) -> dict:
    assert isinstance(detail, list)
    matches = []
    for err in detail:
        if not isinstance(err, dict):
            continue
        if "scheduled_end" not in err.get("loc", ()):
            continue
        msg = err.get("msg")
        if msg == "must be greater than scheduled_start":
            matches.append(err)
        elif (
            isinstance(msg, str)
            and msg.endswith("must be greater than scheduled_start")
        ):
            matches.append(err)
    assert matches, detail
    return matches[0]


def test_change_request_create_end_before_start_is_422(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = (now + timedelta(days=1, hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Bad window",
            "status": "draft",
            "scheduled_start": start,
            "scheduled_end": end,
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 422, created.text
    _schedule_error(created.json()["detail"])


def test_change_request_create_end_equal_start_is_422(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    when = (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Zero length",
            "status": "draft",
            "scheduled_start": when,
            "scheduled_end": when,
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 422, created.text
    _schedule_error(created.json()["detail"])


def test_change_request_update_schedule_ordering(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = (now + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(days=2, hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Patch schedule",
            "status": "draft",
            "scheduled_start": start,
            "scheduled_end": end,
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 201, created.text
    number = created.json()["number"]

    both_bad = tickets_client.patch(
        f"/change-requests/{number}",
        headers=headers,
        json={
            "scheduled_start": end,
            "scheduled_end": start,
        },
    )
    assert both_bad.status_code == 422, both_bad.text
    _schedule_error(both_bad.json()["detail"])

    equal = tickets_client.patch(
        f"/change-requests/{number}",
        headers=headers,
        json={"scheduled_end": start},
    )
    assert equal.status_code == 422, equal.text
    _schedule_error(equal.json()["detail"])

    ok = tickets_client.patch(
        f"/change-requests/{number}",
        headers=headers,
        json={"summary": "Still valid schedule"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["summary"] == "Still valid schedule"


def test_change_request_update_non_schedule_on_invalid_pair_is_422(
    tickets_client: TestClient,
    db_conn: Connection,
) -> None:
    """Fix-on-next-write: summary-only patch fails when stored schedule is invalid."""
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now + timedelta(days=3)
    end = start + timedelta(hours=1)
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Corrupt me",
            "status": "draft",
            "scheduled_start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scheduled_end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]
    number = created.json()["number"]

    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE change_request SET scheduled_end = scheduled_start WHERE id = %s",
            (row_id,),
        )
    db_conn.commit()

    blocked = tickets_client.patch(
        f"/change-requests/{number}",
        headers=headers,
        json={"summary": "Cannot save while schedule invalid"},
    )
    assert blocked.status_code == 422, blocked.text
    _schedule_error(blocked.json()["detail"])


def test_junk_locator_is_422(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    for locator in ("not-a-locator", "256"):
        response = tickets_client.get(f"/incidents/{locator}", headers=headers)
        assert response.status_code == 422, locator


def test_unauthenticated_junk_locator_is_401(tickets_client: TestClient) -> None:
    assert tickets_client.get("/incidents/256").status_code == 401


def test_unauthenticated_is_401(tickets_client: TestClient) -> None:
    assert tickets_client.get(f"/incidents/{SEED_INCIDENT_1_ID}").status_code == 401


def test_readonly_cannot_create(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.post(
        "/incidents",
        headers=headers,
        json={"summary": "Nope", "status": "new", "severity": "Low"},
    )
    assert response.status_code == 403


def test_reject_client_supplied_number(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.post(
        "/incidents",
        headers=headers,
        json={
            "summary": "Nope",
            "status": "new",
            "severity": "Low",
            "number": "INC99999999",
        },
    )
    assert response.status_code == 400


def test_create_missing_required_field_is_400(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.post(
        "/incidents",
        headers=headers,
        json={"status": "new", "severity": "Low"},
    )
    assert response.status_code == 400
    assert any(err.get("type") == "missing" for err in response.json()["detail"])


def test_create_invalid_json_is_400(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.post(
        "/incidents",
        content=b'{"summary":',
        headers={**headers, "content-type": "application/json"},
    )
    assert response.status_code == 400
    assert any(err.get("type") == "json_invalid" for err in response.json()["detail"])


def test_seed_incident_fetchable(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.get(f"/incidents/{SEED_INCIDENT_1_ID}", headers=headers)
    assert response.status_code == 200
    assert response.json()["summary"]
    assert response.json()["number"].startswith("INC")
