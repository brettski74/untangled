"""DB-backed auth API tests: login, refresh rotation, revoke, /auth/me."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection, sql

from untangled.main import app
from untangled.seed.users import SEED_USERS, password_for


@pytest.fixture
def auth_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    """HTTP client against an app whose DB matches the migrated+seeded test DB."""
    assert demo_schema
    # Ensure DATABASE_URL for request-scoped connections matches the test DB.
    with TestClient(app) as client:
        yield client


def _login(client: TestClient, username: str, password: str):
    return client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def test_login_success_returns_token_pair(auth_client: TestClient) -> None:
    admin = SEED_USERS[0]
    response = _login(auth_client, admin.username, password_for(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]
    assert "password" not in body
    assert "password_hash" not in body


def test_login_invalid_credentials_generic_401(auth_client: TestClient) -> None:
    response = _login(auth_client, "admin", "wrong-password")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"

    missing = _login(auth_client, "no-such-user", "anything")
    assert missing.status_code == 401
    assert missing.json()["detail"] == "Invalid username or password"


def test_me_requires_bearer_and_returns_profile(auth_client: TestClient) -> None:
    unauth = auth_client.get("/auth/me")
    assert unauth.status_code == 401

    admin = SEED_USERS[0]
    login = _login(auth_client, admin.username, password_for(admin))
    token = login.json()["access_token"]
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


def test_refresh_rotates_and_invalidates_previous(auth_client: TestClient) -> None:
    admin = SEED_USERS[0]
    login = _login(auth_client, admin.username, password_for(admin))
    old_refresh = login.json()["refresh_token"]

    rotated = auth_client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert rotated.status_code == 200
    new_access = rotated.json()["access_token"]
    new_refresh = rotated.json()["refresh_token"]
    assert new_refresh != old_refresh

    reuse = auth_client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse.status_code == 401

    me = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


def test_logout_revokes_refresh(auth_client: TestClient) -> None:
    admin = SEED_USERS[0]
    login = _login(auth_client, admin.username, password_for(admin))
    refresh = login.json()["refresh_token"]

    logout = auth_client.post("/auth/logout", json={"refresh_token": refresh})
    assert logout.status_code == 204

    reuse = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert reuse.status_code == 401


def test_refresh_rejects_inactive_user(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    admin = SEED_USERS[0]
    login = _login(auth_client, admin.username, password_for(admin))
    refresh = login.json()["refresh_token"]

    db_conn.execute(
        sql.SQL("UPDATE {} SET is_active = FALSE WHERE id = {}").format(
            sql.Identifier("user"),
            sql.Placeholder(),
        ),
        (admin.id,),
    )
    db_conn.commit()

    rejected = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert rejected.status_code == 401

    reuse = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert reuse.status_code == 401


def test_refresh_claim_is_single_use(auth_client: TestClient) -> None:
    """Second rotate of the same token fails (sequential stand-in for concurrent race)."""
    admin = SEED_USERS[0]
    login = _login(auth_client, admin.username, password_for(admin))
    refresh = login.json()["refresh_token"]

    first = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert first.status_code == 200
    second = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert second.status_code == 401


def test_health_remains_public(auth_client: TestClient) -> None:
    response = auth_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
