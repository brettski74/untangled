"""RBAC helpers (HTTP /auth/me and rbac-probe live on the auth service / are gone)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from psycopg import Connection

from untangled.main import app
from untangled.rbac.dependencies import assert_permission
from untangled.seed.users import SEED_ADMIN_ID, SEED_READWRITE_ID


@pytest.fixture
def rbac_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def test_readwrite_denied_delete_via_assert_helper(
    rbac_client: TestClient,
    db_conn: Connection,
) -> None:
    """read_write lacks :delete; assert_permission fails closed with 403."""
    assert rbac_client
    with pytest.raises(HTTPException) as exc_info:
        assert_permission(db_conn, SEED_READWRITE_ID, "demo_item:delete")
    assert exc_info.value.status_code == 403
    assert_permission(db_conn, SEED_ADMIN_ID, "demo_item:delete")


def test_rbac_probe_is_unregistered(rbac_client: TestClient) -> None:
    response = rbac_client.get("/auth/rbac-probe")
    assert response.status_code == 404
