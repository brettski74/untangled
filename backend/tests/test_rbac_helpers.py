"""Unit tests for RBAC permission keys and grant logic (no database)."""

from __future__ import annotations

import pytest

from untangled.rbac.dependencies import require_class_operation, require_permission
from untangled.rbac.keys import (
    ADMIN_PERMISSION_KEY,
    class_operation_key,
    parse_permission_key,
    permission_grants,
)


def test_class_operation_key_format() -> None:
    assert class_operation_key("demo-item", "read") == "demo-item:read"
    assert class_operation_key("change-request", "delete") == "change-request:delete"


def test_class_operation_key_rejects_bad_inputs() -> None:
    with pytest.raises(ValueError, match="invalid class name"):
        class_operation_key("bad:name", "read")
    with pytest.raises(ValueError, match="unsupported operation"):
        class_operation_key("incident", "list")


def test_parse_permission_key_class_op_and_admin() -> None:
    assert parse_permission_key("incident:update") == ("incident", "update")
    assert parse_permission_key(ADMIN_PERMISSION_KEY) == (None, None)
    assert parse_permission_key("custom-non-class") == (None, None)


def test_parse_permission_key_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        parse_permission_key("")
    with pytest.raises(ValueError):
        parse_permission_key(" incident:read")
    with pytest.raises(ValueError):
        parse_permission_key("incident:list")
    with pytest.raises(ValueError):
        parse_permission_key("a:b:c")


def test_permission_grants_admin_short_circuit() -> None:
    effective = frozenset({ADMIN_PERMISSION_KEY})
    assert permission_grants(effective, "demo-item:delete")
    assert permission_grants(effective, "incident:create")
    assert permission_grants(effective, ADMIN_PERMISSION_KEY)


def test_permission_grants_exact_and_deny() -> None:
    effective = frozenset({"demo-item:read", "demo-item:create"})
    assert permission_grants(effective, "demo-item:read")
    assert not permission_grants(effective, "demo-item:delete")
    assert not permission_grants(frozenset(), "demo-item:read")


def test_require_permission_factory_allow_and_403() -> None:
    dep = require_permission("demo-item:read")
    user = {"id": "u", "username": "x"}
    assert dep(user=user, permissions=frozenset({"demo-item:read"})) is user

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        dep(user=user, permissions=frozenset({"demo-item:create"}))
    assert exc_info.value.status_code == 403
    assert "demo-item:read" in str(exc_info.value.detail)


def test_require_class_operation_uses_canonical_key() -> None:
    dep = require_class_operation("change-request", "update")
    user = {"id": "u"}
    assert dep(user=user, permissions=frozenset({"change-request:update"})) is user

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        dep(user=user, permissions=frozenset({"change-request:read"}))
    assert exc_info.value.status_code == 403


def test_require_permission_admin_allows_any() -> None:
    dep = require_permission("incident:delete")
    user = {"id": "u"}
    assert dep(user=user, permissions=frozenset({ADMIN_PERMISSION_KEY})) is user
