"""DB-backed auth API tests: 410 login/refresh, Bearer /auth/me, logout."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection

from untangled.main import app
from untangled.seed.users import SEED_USERS


@pytest.fixture
def auth_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    """HTTP client against an app whose DB matches the migrated+seeded test DB."""
    assert demo_schema
    with TestClient(app) as client:
        yield client


def test_login_is_gone(auth_client: TestClient) -> None:
    admin = SEED_USERS[0]
    response = auth_client.post(
        "/auth/login",
        data={"username": admin.username, "password": "admin-change-me"},
    )
    assert response.status_code == 410
    assert "api/v2/auth/login" in response.json()["detail"]


def test_refresh_is_gone(auth_client: TestClient) -> None:
    response = auth_client.post("/auth/refresh", json={"refresh_token": "anything"})
    assert response.status_code == 410


def test_me_requires_bearer_and_returns_profile(auth_client: TestClient) -> None:
    unauth = auth_client.get("/auth/me")
    assert unauth.status_code == 401

    admin = SEED_USERS[0]
    token = bearer_for(admin.username)
    me = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    profile = me.json()
    assert profile["username"] == "admin"
    assert profile["display_name"] == admin.display_name
    assert profile["is_active"] is True
    assert profile["roles"] == ["admin"]
    assert profile["permissions"] == ["admin"]
    assert "password_hash" not in profile
    assert "password" not in profile


def test_logout_unknown_refresh_is_idempotent(auth_client: TestClient) -> None:
    logout = auth_client.post("/auth/logout", json={"refresh_token": "not-a-real-token"})
    assert logout.status_code == 204


def test_health_remains_public(auth_client: TestClient) -> None:
    response = auth_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
