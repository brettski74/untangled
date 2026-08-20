"""DB-backed tests for Incident / Change Request HTTP CRUD."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for, mint_access_token
from psycopg import Connection

from untangled.main import app
from untangled.seed.tickets import SEED_INCIDENT_1_ID
from untangled.seed.users import SEED_USERS


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _bearer(_client: TestClient, username: str) -> str:
    return bearer_for(username)


def _headers(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def test_incident_crud_uuid_and_friendly_locator(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/api/v2/incident",
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

    by_id = tickets_client.get(f"/api/v2/incident/{body['id']}", headers=headers)
    assert by_id.status_code == 200
    assert by_id.json()["number"] == body["number"]

    by_num = tickets_client.get(f"/api/v2/incident/{body['number']}", headers=headers)
    assert by_num.status_code == 200
    assert by_num.json()["id"] == body["id"]

    updated = tickets_client.patch(
        f"/api/v2/incident/{body['number']}",
        headers=headers,
        json={"status": "in-progress"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "in-progress"
    assert updated.json()["number"] == body["number"]

    # readwrite cannot delete
    denied = tickets_client.delete(f"/api/v2/incident/{body['id']}", headers=headers)
    assert denied.status_code == 403

    admin = _headers(tickets_client, "admin")
    deleted = tickets_client.delete(f"/api/v2/incident/{body['id']}", headers=admin)
    assert deleted.status_code == 204
    missing = tickets_client.get(f"/api/v2/incident/{body['id']}", headers=admin)
    assert missing.status_code == 404


def test_change_request_create_requires_schedule(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(days=1, hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    created = tickets_client.post(
        "/api/v2/change_request",
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


def test_junk_locator_is_422(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    for locator in ("not-a-locator", "256"):
        response = tickets_client.get(f"/api/v2/incident/{locator}", headers=headers)
        assert response.status_code == 422, locator


def test_unauthenticated_junk_locator_is_401(tickets_client: TestClient) -> None:
    assert tickets_client.get("/api/v2/incident/256").status_code == 401


def test_unauthenticated_is_401(tickets_client: TestClient) -> None:
    response = tickets_client.get(f"/api/v2/incident/{SEED_INCIDENT_1_ID}")
    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}
    assert "retry" not in response.json()


def test_expired_access_is_401_with_retry(tickets_client: TestClient) -> None:
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = mint_access_token(SEED_USERS[0].id, now=past, ttl_seconds=1)
    response = tickets_client.get(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Could not validate credentials",
        "retry": True,
    }


def test_tampered_access_is_401_without_retry(tickets_client: TestClient) -> None:
    token = mint_access_token(SEED_USERS[0].id) + "x"
    response = tickets_client.get(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}


def test_readonly_cannot_create(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.post(
        "/api/v2/incident",
        headers=headers,
        json={"summary": "Nope", "status": "new", "severity": "Low"},
    )
    assert response.status_code == 403


def test_reject_client_supplied_number(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.post(
        "/api/v2/incident",
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
        "/api/v2/incident",
        headers=headers,
        json={"status": "new", "severity": "Low"},
    )
    assert response.status_code == 400
    assert any(err.get("type") == "missing" for err in response.json()["detail"])


def test_create_invalid_json_is_400(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.post(
        "/api/v2/incident",
        content=b'{"summary":',
        headers={**headers, "content-type": "application/json"},
    )
    assert response.status_code == 400
    assert any(err.get("type") == "json_invalid" for err in response.json()["detail"])


def test_seed_incident_fetchable(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.get(f"/api/v2/incident/{SEED_INCIDENT_1_ID}", headers=headers)
    assert response.status_code == 200
    assert response.json()["summary"]
    assert response.json()["number"].startswith("INC")
