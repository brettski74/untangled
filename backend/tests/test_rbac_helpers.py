"""Unit tests for RBAC permission keys and grant logic (no database)."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from untangled.rbac.dependencies import require_class_operation, require_permission
from untangled.rbac.keys import (
    ADMIN_PERMISSION_KEY,
    class_operation_granted,
    class_operation_key,
    parse_permission_key,
    permission_grants,
)


def _fake_request() -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }
    return Request(scope)


def test_class_operation_key_format() -> None:
    assert class_operation_key("demo_item", "read") == "demo_item:read"
    assert class_operation_key("change_request", "delete") == "change_request:delete"
    assert class_operation_key("incident", "search") == "incident:search"
    assert class_operation_key("user", "password_reset") == "user:password_reset"


def test_class_operation_key_rejects_bad_inputs() -> None:
    with pytest.raises(ValueError, match="invalid class name"):
        class_operation_key("bad:name", "read")
    with pytest.raises(ValueError, match="unsupported operation"):
        class_operation_key("incident", "bad:op")
    with pytest.raises(ValueError, match="unsupported operation"):
        class_operation_key("incident", "")


def test_parse_permission_key_class_op_and_admin() -> None:
    assert parse_permission_key("incident:update") == ("incident", "update")
    assert parse_permission_key("incident:search") == ("incident", "search")
    assert parse_permission_key("user:password_reset") == ("user", "password_reset")
    assert parse_permission_key(ADMIN_PERMISSION_KEY) == (None, None)
    assert parse_permission_key("custom-non-class") == (None, None)


def test_parse_permission_key_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        parse_permission_key("")
    with pytest.raises(ValueError):
        parse_permission_key(" incident:read")
    with pytest.raises(ValueError):
        parse_permission_key("a:b:c")


def test_permission_grants_admin_short_circuit() -> None:
    effective = frozenset({ADMIN_PERMISSION_KEY})
    assert permission_grants(effective, "demo_item:delete")
    assert permission_grants(effective, "incident:create")
    assert permission_grants(effective, ADMIN_PERMISSION_KEY)


def test_permission_grants_exact_and_deny() -> None:
    effective = frozenset({"demo_item:read", "demo_item:create"})
    assert permission_grants(effective, "demo_item:read")
    assert not permission_grants(effective, "demo_item:delete")
    assert not permission_grants(frozenset(), "demo_item:read")


def test_require_permission_factory_allow_and_403() -> None:
    dep = require_permission("demo_item:read")
    user = {"id": "u", "username": "x"}
    request = _fake_request()
    assert (
        dep(request=request, user=user, permissions=frozenset({"demo_item:read"}))
        is user
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        dep(request=request, user=user, permissions=frozenset({"demo_item:create"}))
    assert exc_info.value.status_code == 403
    assert "demo_item:read" in str(exc_info.value.detail)


def test_require_class_operation_uses_canonical_key() -> None:
    dep = require_class_operation("change_request", "update")
    user = {"id": "u"}
    request = _fake_request()
    assert (
        dep(
            request=request,
            user=user,
            permissions=frozenset({"change_request:update"}),
        )
        is user
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        dep(
            request=request,
            user=user,
            permissions=frozenset({"change_request:read"}),
        )
    assert exc_info.value.status_code == 403


def test_require_permission_admin_allows_any() -> None:
    dep = require_permission("incident:delete")
    user = {"id": "u"}
    assert (
        dep(
            request=_fake_request(),
            user=user,
            permissions=frozenset({ADMIN_PERMISSION_KEY}),
        )
        is user
    )


def test_class_operation_granted_public_read_and_search() -> None:
    empty = frozenset()
    assert class_operation_granted(empty, "system_config", "read", public=True)
    assert class_operation_granted(empty, "system_config", "search", public=True)
    assert not class_operation_granted(empty, "system_config", "update", public=True)
    assert not class_operation_granted(empty, "incident", "read", public=False)
    assert not class_operation_granted(empty, "incident", "search", public=False)


def test_require_class_operation_public_read(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    from fastapi import HTTPException

    from untangled.rbac import dependencies as rbac_deps

    monkeypatch.setattr(
        rbac_deps,
        "class_definition",
        lambda name: SimpleNamespace(public=name == "public_item"),
    )
    user = {"id": "u"}
    request = _fake_request()
    public_dep = require_class_operation("public_item", "read")
    assert public_dep(request=request, user=user, permissions=frozenset()) is user

    private_dep = require_class_operation("incident", "read")
    with pytest.raises(HTTPException) as exc_info:
        private_dep(request=request, user=user, permissions=frozenset())
    assert exc_info.value.status_code == 403
