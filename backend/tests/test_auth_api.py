"""DB-backed auth API tests: unregistered login/refresh, Bearer /auth/me, logout."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection

from untangled.main import app
from untangled.seed.users import SEED_USERS

_LEFTOVER_AUTH_PATHS = (
    "/auth/me",
    "/auth/change-password",
    "/auth/logout",
    "/auth/rbac-probe",
)
_BEARER_PROTECTED_LEFTOVERS = (
    "/auth/me",
    "/auth/change-password",
    "/auth/rbac-probe",
)
_HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})


@pytest.fixture
def auth_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    """HTTP client against an app whose DB matches the migrated+seeded test DB."""
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _unregistered_body(client: TestClient) -> dict:
    response = client.post("/auth/no-such-route")
    assert response.status_code == 404
    return response.json()


def test_login_and_refresh_are_unregistered(auth_client: TestClient) -> None:
    expected = _unregistered_body(auth_client)
    admin = SEED_USERS[0]
    login = auth_client.post(
        "/auth/login",
        data={"username": admin.username, "password": "admin-change-me"},
    )
    refresh = auth_client.post("/auth/refresh", json={"refresh_token": "anything"})
    assert login.status_code == 404
    assert refresh.status_code == 404
    assert login.json() == expected
    assert refresh.json() == expected
    assert "api/v2/auth/login" not in login.text
    assert "api/v2/auth/login" not in refresh.text


def test_me_requires_bearer_and_returns_profile(auth_client: TestClient) -> None:
    unauth = auth_client.get("/auth/me")
    assert unauth.status_code == 401
    assert unauth.headers.get("www-authenticate", "").lower().startswith("bearer")

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


def test_openapi_has_no_python_login_or_oauth2_password(auth_client: TestClient) -> None:
    spec = auth_client.get("/openapi.json").json()
    paths = spec["paths"]
    assert "/auth/login" not in paths
    assert "/auth/refresh" not in paths
    for leftover in _LEFTOVER_AUTH_PATHS:
        assert leftover in paths
    schemes = spec.get("components", {}).get("securitySchemes", {})
    bearer_names = [
        name
        for name, scheme in schemes.items()
        if scheme.get("type") == "http" and str(scheme.get("scheme", "")).lower() == "bearer"
    ]
    assert bearer_names
    for scheme in schemes.values():
        assert scheme.get("type") != "oauth2"
        assert "password" not in (scheme.get("flows") or {})
    required_bearer = {bearer_names[0]: []}
    for leftover in _BEARER_PROTECTED_LEFTOVERS:
        for method, operation in paths[leftover].items():
            if method not in _HTTP_METHODS:
                continue
            security = operation.get("security") or []
            assert required_bearer in security
            assert {} not in security
    logout_security = (paths["/auth/logout"].get("post") or {}).get("security")
    assert not logout_security


def test_logout_unknown_refresh_is_idempotent(auth_client: TestClient) -> None:
    logout = auth_client.post("/auth/logout", json={"refresh_token": "not-a-real-token"})
    assert logout.status_code == 204


def test_health_remains_public(auth_client: TestClient) -> None:
    response = auth_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
