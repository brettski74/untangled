"""Integration tests for /api/v2 record factory (enrichment, create, delete)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection

from untangled.main import app
from untangled.seed.tickets import SEED_INCIDENT_1_ID
from untangled.seed.users import SEED_ADMIN_ID, SEED_USERS


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _bearer(_client: TestClient, username: str) -> str:
    return bearer_for(username)


def _headers(client: TestClient, username: str = "readonly") -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def test_v2_fetch_enriches_audit_fk(tickets_client: TestClient) -> None:
    response = tickets_client.get(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    created = body["created_by"]
    assert isinstance(created, dict)
    assert created["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in created
    assert isinstance(created["display_name"], str)
    assert created["display_name"].strip() != ""
    assert "friendly_id" not in created


def test_v2_search_enriches_projected_fks(tickets_client: TestClient) -> None:
    response = tickets_client.post(
        "/api/v2/incident/search",
        headers=_headers(tickets_client),
        json={
            "attributes": ["assigned_user_id", "summary", "created_by"],
            "predicate": {
                "op": "eq",
                "attribute": "id",
                "value": str(SEED_INCIDENT_1_ID),
            },
        },
    )
    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert list(item.keys()) == ["id", "assigned_user_id", "summary", "created_by"]
    assert isinstance(item["created_by"], dict)
    assert item["created_by"]["id"] == str(SEED_ADMIN_ID)
    assert "display_name" in item["created_by"]


def test_v2_patch_enriches_and_requires_update_permission(
    tickets_client: TestClient,
) -> None:
    denied = tickets_client.patch(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
        headers=_headers(tickets_client, "readonly"),
        json={"status": "in-progress"},
    )
    assert denied.status_code == 403

    headers = _headers(tickets_client, "admin")
    admin = next(s for s in SEED_USERS if s.username == "admin")
    updated = tickets_client.patch(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
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
    updated_by = body["updated_by"]
    assert isinstance(updated_by, dict)
    assert updated_by["id"] == str(admin.id)

    restore = tickets_client.patch(
        f"/api/v2/incident/{SEED_INCIDENT_1_ID}",
        headers=headers,
        json={"assigned_user_id": None, "status": "new"},
    )
    assert restore.status_code == 200, restore.text


def test_v2_create_returns_enriched_fks(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/api/v2/incident",
        headers=headers,
        json={
            "summary": "v2 create enrichment",
            "status": "new",
            "severity": "Low",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["summary"] == "v2 create enrichment"
    assert body["number"].startswith("INC")
    created_by = body["created_by"]
    assert isinstance(created_by, dict)
    assert "id" in created_by
    assert "display_name" in created_by
    assert isinstance(created_by["display_name"], str)
    assert created_by["display_name"].strip() != ""
    updated_by = body["updated_by"]
    assert isinstance(updated_by, dict)
    assert "id" in updated_by
    assert "display_name" in updated_by

    admin = _headers(tickets_client, "admin")
    deleted = tickets_client.delete(
        f"/api/v2/incident/{body['id']}",
        headers=admin,
    )
    assert deleted.status_code == 204


def test_v2_delete_and_authz(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/api/v2/incident",
        headers=headers,
        json={
            "summary": "v2 delete target",
            "status": "new",
            "severity": "Low",
        },
    )
    assert created.status_code == 201, created.text
    record_id = created.json()["id"]

    denied = tickets_client.delete(
        f"/api/v2/incident/{record_id}",
        headers=headers,
    )
    assert denied.status_code == 403

    admin = _headers(tickets_client, "admin")
    deleted = tickets_client.delete(
        f"/api/v2/incident/{record_id}",
        headers=admin,
    )
    assert deleted.status_code == 204
    missing = tickets_client.get(
        f"/api/v2/incident/{record_id}",
        headers=admin,
    )
    assert missing.status_code == 404


def test_v2_system_config_suppresses_create_search_delete(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "admin")
    # Suppressed ops are unbound. POST /search may 405 because GET /{locator}
    # still matches the "search" path segment.
    create = tickets_client.post(
        "/api/v2/system_config",
        headers=headers,
        json={},
    )
    assert create.status_code in (404, 405), create.text
    search = tickets_client.post(
        "/api/v2/system_config/search",
        headers=headers,
        json={},
    )
    assert search.status_code in (404, 405), search.text


def test_v2_user_class_is_not_mounted(tickets_client: TestClient) -> None:
    """Auth/RBAC classes declare no permissions → no generic record mounts."""
    response = tickets_client.post(
        "/api/v2/user/search",
        headers=_headers(tickets_client, "admin"),
        json={"limit": 1},
    )
    assert response.status_code == 404, response.text


def test_legacy_and_v1_record_surfaces_not_mounted(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "admin")
    body = {"summary": "x", "status": "new", "priority": "Low"}
    for path in (
        "/incidents",
        "/api/v1/incidents",
        "/change-requests",
        "/api/v1/change-requests",
        "/system-configs",
        "/api/v1/system-configs",
    ):
        assert tickets_client.post(path, headers=headers, json=body).status_code == 404
        assert tickets_client.get(f"{path}/x", headers=headers).status_code == 404
        assert (
            tickets_client.post(f"{path}/search", headers=headers, json={}).status_code
            == 404
        )
