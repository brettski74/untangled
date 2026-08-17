"""Python POST /auth/change-password is unmounted (auth service owns the path)."""

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
    assert demo_schema
    with TestClient(app) as client:
        yield client


def test_python_change_password_is_unregistered(auth_client: TestClient) -> None:
    token = bearer_for(SEED_USERS[0].username)
    response = auth_client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "admin-change-me",
            "new_password": "unused",
            "verify_new_password": "unused",
        },
    )
    assert response.status_code == 404
