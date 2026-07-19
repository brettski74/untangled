"""DB-backed HTTP tests for RBAC on ``/auth/me`` and the probe route."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection

from untangled.main import app
from untangled.rbac.keys import ADMIN_PERMISSION_KEY, class_operation_key
from untangled.seed.users import SEED_USERS, password_for


@pytest.fixture
def rbac_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
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


def test_me_includes_roles_and_permissions(rbac_client: TestClient) -> None:
    token = _bearer(rbac_client, "readonly")
    me = rbac_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["roles"] == ["read-only"]
    assert class_operation_key("demo-item", "read") in body["permissions"]
    assert class_operation_key("demo-item", "delete") not in body["permissions"]
    assert ADMIN_PERMISSION_KEY not in body["permissions"]
    assert "password_hash" not in body
    assert "password" not in body


def test_me_admin_lists_admin_permission(rbac_client: TestClient) -> None:
    token = _bearer(rbac_client, "admin")
    me = rbac_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["roles"] == ["admin"]
    assert body["permissions"] == [ADMIN_PERMISSION_KEY]


def test_rbac_probe_unauthenticated_is_401(rbac_client: TestClient) -> None:
    response = rbac_client.get("/auth/rbac-probe")
    assert response.status_code == 401


def test_rbac_probe_allows_seed_users_with_read(rbac_client: TestClient) -> None:
    for username in ("admin", "readonly", "readwrite"):
        token = _bearer(rbac_client, username)
        response = rbac_client.get(
            "/auth/rbac-probe",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, username
        body = response.json()
        assert body["ok"] is True
        assert body["required_permission"] == "demo-item:read"


def test_rbac_probe_forbidden_without_permission(
    rbac_client: TestClient,
    db_conn: Connection,
) -> None:
    """Authenticated user with no roles gets 403 on the probe."""
    from datetime import datetime, timezone

    from psycopg import sql

    from untangled.auth.passwords import hash_password
    from untangled.persistence.ids import new_uuid7

    user_id = new_uuid7()
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ("
                "id, created_at, updated_at, created_by, updated_by, "
                "username, password_hash, display_name, is_active"
                ") VALUES ("
                "{}, {}, {}, {}, {}, {}, {}, {}, {}"
                ")"
            ).format(
                sql.Identifier("user"),
                *[sql.Placeholder() for _ in range(9)],
            ),
            (
                user_id,
                now,
                now,
                user_id,
                user_id,
                "noroles",
                hash_password("noroles-change-me"),
                "No Roles",
                True,
            ),
        )
    db_conn.commit()

    login = _login(rbac_client, "noroles", "noroles-change-me")
    assert login.status_code == 200
    token = login.json()["access_token"]
    response = rbac_client.get(
        "/auth/rbac-probe",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "demo-item:read" in response.json()["detail"]


def test_readwrite_denied_delete_via_assert_helper(
    rbac_client: TestClient,
    db_conn: Connection,
) -> None:
    """read-write lacks :delete; assert_permission fails closed with 403."""
    from fastapi import HTTPException

    from untangled.rbac.dependencies import assert_permission
    from untangled.seed.users import SEED_READWRITE_ID

    assert rbac_client  # fixture ensures migrated+seeded schema
    with pytest.raises(HTTPException) as exc_info:
        assert_permission(db_conn, SEED_READWRITE_ID, "demo-item:delete")
    assert exc_info.value.status_code == 403

    # Admin short-circuit allows delete.
    from untangled.seed.users import SEED_ADMIN_ID

    assert_permission(db_conn, SEED_ADMIN_ID, "demo-item:delete")
