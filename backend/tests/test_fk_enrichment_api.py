"""Versioned FK identity enrichment on /api/v1 fetch, search, and update."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection

from untangled.main import app
from untangled.seed.tickets import SEED_INCIDENT_1_ID
from untangled.seed.users import SEED_ADMIN_ID, SEED_USERS, password_for


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _bearer(client: TestClient, username: str) -> str:
    seed = next(s for s in SEED_USERS if s.username == username)
    login = client.post(
        "/auth/login",
        data={"username": seed.username, "password": password_for(seed)},
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def _headers(client: TestClient, username: str = "readonly") -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def test_legacy_fetch_keeps_scalar_fk(tickets_client: TestClient) -> None:
    response = tickets_client.get(
        f"/incidents/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["created_by"], str)
    assert body["created_by"] == str(SEED_ADMIN_ID)
    assert body["assigned_user_id"] is None or isinstance(body["assigned_user_id"], str)


def test_v1_fetch_enriches_audit_and_optional_fk(tickets_client: TestClient) -> None:
    response = tickets_client.get(
        f"/api/v1/incidents/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assigned = body["assigned_user_id"]
    if assigned is None:
        pass
    else:
        assert isinstance(assigned, dict)
        assert "id" in assigned
        assert "display_name" in assigned
        assert "friendly_id" not in assigned
    created = body["created_by"]
    assert isinstance(created, dict)
    assert created["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in created
    assert isinstance(created["display_name"], str)
    assert created["display_name"].strip() != ""
    assert "friendly_id" not in created
    updated = body["updated_by"]
    assert isinstance(updated, dict)
    assert updated["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in updated


def test_v1_search_joins_only_projected_fks(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client)
    id_only = tickets_client.post(
        "/api/v1/incidents/search",
        headers=headers,
        json={},
    )
    assert id_only.status_code == 200, id_only.text
    for item in id_only.json()["items"]:
        assert set(item.keys()) == {"id"}

    projected = tickets_client.post(
        "/api/v1/incidents/search",
        headers=headers,
        json={
            "attributes": ["assigned_user_id", "summary", "created_by"],
            "predicate": {
                "op": "eq",
                "attribute": "id",
                "value": str(SEED_INCIDENT_1_ID),
            },
        },
    )
    assert projected.status_code == 200, projected.text
    item = projected.json()["items"][0]
    assert list(item.keys()) == ["id", "assigned_user_id", "summary", "created_by"]
    if item["assigned_user_id"] is not None:
        assert isinstance(item["assigned_user_id"], dict)
        assert "id" in item["assigned_user_id"]
    assert isinstance(item["created_by"], dict)
    assert item["created_by"]["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in item["created_by"]


def test_v1_search_count_matches_legacy(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client)
    body = {
        "predicate": {"op": "eq", "attribute": "status", "value": "new"},
        "attributes": ["assigned_user_id", "status"],
        "limit": 5,
    }
    legacy = tickets_client.post("/incidents/search", headers=headers, json=body)
    versioned = tickets_client.post(
        "/api/v1/incidents/search", headers=headers, json=body
    )
    assert legacy.status_code == 200
    assert versioned.status_code == 200
    assert legacy.json()["total"] == versioned.json()["total"]
    assert legacy.json()["limit"] == versioned.json()["limit"]
    assert len(legacy.json()["items"]) == len(versioned.json()["items"])
    for legacy_item, versioned_item in zip(
        legacy.json()["items"], versioned.json()["items"], strict=True
    ):
        assert legacy_item["id"] == versioned_item["id"]
        assert isinstance(legacy_item.get("assigned_user_id"), (str, type(None)))
        assigned = versioned_item.get("assigned_user_id")
        assert assigned is None or isinstance(assigned, dict)


def test_v1_assign_user_returns_display_only(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    updated = tickets_client.patch(
        f"/incidents/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": str(admin.id)},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["assigned_user_id"] == str(admin.id)

    fetched = tickets_client.get(
        f"/api/v1/incidents/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client),
    )
    assert fetched.status_code == 200
    assigned = fetched.json()["assigned_user_id"]
    assert isinstance(assigned, dict)
    assert assigned["id"] == str(admin.id)
    assert assigned["display_name"] == admin.display_name
    assert "friendly_id" not in assigned

    # Restore prior null for other tests sharing the DB fixture.
    restore = tickets_client.patch(
        f"/incidents/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": None},
    )
    assert restore.status_code == 200


def test_v1_search_filter_still_accepts_scalar_uuid(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    tickets_client.patch(
        f"/incidents/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": str(admin.id)},
    )
    try:
        response = tickets_client.post(
            "/api/v1/incidents/search",
            headers=_headers(tickets_client),
            json={
                "predicate": {
                    "op": "eq",
                    "attribute": "assigned_user_id",
                    "value": str(admin.id),
                },
                "attributes": ["assigned_user_id"],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["total"] >= 1
        item = next(
            i for i in response.json()["items"] if i["id"] == str(SEED_INCIDENT_1_ID)
        )
        assert item["assigned_user_id"]["id"] == str(admin.id)
    finally:
        tickets_client.patch(
            f"/incidents/{SEED_INCIDENT_1_ID}",
            headers=headers,
            json={"assigned_user_id": None},
        )


def test_v1_patch_enriches_audit_and_optional_fk(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    updated = tickets_client.patch(
        f"/api/v1/incidents/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": str(admin.id), "status": "in-progress"},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["status"] == "in-progress"
    assigned = body["assigned_user_id"]
    assert isinstance(assigned, dict)
    assert assigned["id"] == str(admin.id)
    assert assigned["display_name"] == admin.display_name
    assert "friendly_id" not in assigned
    created = body["created_by"]
    assert isinstance(created, dict)
    assert created["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in created
    assert isinstance(created["display_name"], str)
    assert created["display_name"].strip() != ""
    assert "friendly_id" not in created
    updated_by = body["updated_by"]
    assert isinstance(updated_by, dict)
    assert updated_by["id"] == str(admin.id)
    assert updated_by["display_name"] == admin.display_name

    legacy = tickets_client.patch(
        f"/incidents/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": None, "status": "new"},
    )
    assert legacy.status_code == 200, legacy.text
    assert isinstance(legacy.json()["assigned_user_id"], (str, type(None)))
    assert legacy.json()["assigned_user_id"] is None
    assert isinstance(legacy.json()["updated_by"], str)
    assert legacy.json()["updated_by"] == str(admin.id)


def test_v1_patch_requires_update_permission(tickets_client: TestClient) -> None:
    denied = tickets_client.patch(
        f"/api/v1/incidents/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client, "readonly"),
        json={"status": "in-progress"},
    )
    assert denied.status_code == 403


def test_no_v1_create_route(tickets_client: TestClient) -> None:
    response = tickets_client.post(
        "/api/v1/incidents",
        headers=_headers(tickets_client, "admin"),
        json={"summary": "x", "status": "new", "severity": "Low"},
    )
    # No create binding under /api/v1 — unmatched path/method yields 404.
    assert response.status_code == 404
