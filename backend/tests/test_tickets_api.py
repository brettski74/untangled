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
    now = datetime.now(timezone.utc)
    created = tickets_client.post(
        "/change-requests",
        headers=headers,
        json={
            "summary": "Swap switch",
            "status": "draft",
            "scheduled_start": (now + timedelta(days=1)).isoformat(),
            "scheduled_end": (now + timedelta(days=1, hours=2)).isoformat(),
            "requested_by": str(admin.id),
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["number"].startswith("CHG")


def test_junk_locator_is_400(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.get("/incidents/not-a-locator", headers=headers)
    assert response.status_code == 400


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
    assert response.status_code == 422


def test_seed_incident_fetchable(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.get(f"/incidents/{SEED_INCIDENT_1_ID}", headers=headers)
    assert response.status_code == 200
    assert response.json()["summary"]
    assert response.json()["number"].startswith("INC")
