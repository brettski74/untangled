"""Must-change JWT claim refuses domain APIs except the system_config singleton GET."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import mint_access_token
from psycopg import Connection

from untangled.auth.tokens import PASSWORD_CHANGE_REQUIRED_ERROR
from untangled.main import app
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.seed.users import SEED_USERS


@pytest.fixture
def api_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _must_change_token() -> str:
    return mint_access_token(
        SEED_USERS[0].id,
        extra={"password_change_required": True},
    )


def test_must_change_allows_system_config_singleton_get(
    api_client: TestClient,
) -> None:
    token = _must_change_token()
    response = api_client.get(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(SYSTEM_CONFIG_ID)


def test_must_change_refuses_other_reads(api_client: TestClient) -> None:
    token = _must_change_token()
    response = api_client.post(
        "/api/v2/incident/search",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 403
    body = response.json()
    assert body["detail"]["error"] == PASSWORD_CHANGE_REQUIRED_ERROR
    assert body["detail"]["error"] != "Forbidden"


def test_must_change_refuses_system_config_write(api_client: TestClient) -> None:
    token = _must_change_token()
    response = api_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json={"password_expiry_days": 90},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["error"] == PASSWORD_CHANGE_REQUIRED_ERROR


def test_rbac_forbidden_is_not_password_change_required(
    api_client: TestClient,
) -> None:
    from jwt_mint import bearer_for

    token = bearer_for("readonly")
    response = api_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json={"password_expiry_days": 90},
    )
    assert response.status_code == 403
    body = response.json()
    assert isinstance(body.get("detail"), str)
    assert "password_change_required" not in body
    assert PASSWORD_CHANGE_REQUIRED_ERROR not in str(body)
