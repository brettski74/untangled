"""Python API no longer mounts /auth/* (auth-session lives on the auth service)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection

from untangled.main import app
from untangled.seed.users import SEED_USERS

_PYTHON_AUTH_PATHS = (
    "/auth/me",
    "/auth/change-password",
    "/auth/logout",
    "/auth/rbac-probe",
    "/auth/login",
    "/auth/refresh",
)


@pytest.fixture
def auth_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def test_python_auth_paths_are_unregistered(auth_client: TestClient) -> None:
    expected = auth_client.post("/auth/no-such-route")
    assert expected.status_code == 404
    body = expected.json()
    for path in _PYTHON_AUTH_PATHS:
        if path.endswith("login"):
            response = auth_client.post(
                path,
                data={"username": "admin", "password": "x"},
            )
        elif path.endswith("logout") or path.endswith("refresh"):
            response = auth_client.post(path, json={"refresh_token": "x"})
        elif path.endswith("change-password"):
            token = bearer_for(SEED_USERS[0].username)
            response = auth_client.post(
                path,
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
        else:
            response = auth_client.get(path)
        assert response.status_code == 404, path
        assert response.json() == body


def test_openapi_has_no_auth_session_paths(auth_client: TestClient) -> None:
    paths = auth_client.get("/openapi.json").json()["paths"]
    for path in _PYTHON_AUTH_PATHS:
        assert path not in paths


def test_health_remains_public(auth_client: TestClient) -> None:
    response = auth_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
