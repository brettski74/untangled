"""Unit tests for the distinct /api/v2 record router factory."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from untangled.records.v2_mounts import build_v2_record_routers
from untangled.records.v2_router_factory import build_v2_class_router


def _route_keys(router) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for route in router.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", "")
        for method in methods:
            if method == "HEAD":
                continue
            keys.add((method, path))
    return keys


def test_v2_permissions_omit_undeclared_endpoints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from untangled.records import v2_router_factory as factory

    monkeypatch.setattr(factory, "model", lambda *_args, **_kwargs: object)
    monkeypatch.setattr(
        factory,
        "class_definition",
        lambda _name: SimpleNamespace(
            permissions=("read", "update"),
            public=True,
        ),
    )
    v2 = build_v2_class_router(
        class_name="singleton_item",
        prefix="/api/v2/singleton_item",
        tags=["singleton-v2"],
    )
    keys = _route_keys(v2)
    assert ("POST", "/api/v2/singleton_item") not in keys
    assert ("POST", "/api/v2/singleton_item/search") not in keys
    assert ("DELETE", "/api/v2/singleton_item/{locator}") not in keys
    assert ("GET", "/api/v2/singleton_item/{locator}") in keys
    assert ("PATCH", "/api/v2/singleton_item/{locator}") in keys


def test_v2_full_crud_routes_use_singular_class_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from untangled.records import v2_router_factory as factory

    monkeypatch.setattr(factory, "model", lambda *_args, **_kwargs: object)
    monkeypatch.setattr(
        factory,
        "class_definition",
        lambda _name: SimpleNamespace(
            permissions=("create", "read", "search", "update", "delete"),
            public=False,
        ),
    )
    v2 = build_v2_class_router(
        class_name="change_request",
        prefix="/api/v2/change_request",
        tags=["change_request-v2"],
    )
    keys = _route_keys(v2)
    assert ("POST", "/api/v2/change_request") in keys
    assert ("POST", "/api/v2/change_request/search") in keys
    assert ("GET", "/api/v2/change_request/{locator}") in keys
    assert ("PATCH", "/api/v2/change_request/{locator}") in keys
    assert ("DELETE", "/api/v2/change_request/{locator}") in keys
    # No pluralized collection segment.
    assert not any("/change-requests" in path for _, path in keys)


def test_v2_mounts_include_declared_product_classes_only() -> None:
    routers = build_v2_record_routers()
    prefixes = {router.prefix for router in routers}
    assert "/api/v2/incident" in prefixes
    assert "/api/v2/change_request" in prefixes
    assert "/api/v2/system_config" in prefixes
    assert "/api/v2/demo_item" in prefixes
    assert "/api/v2/demo_link" in prefixes
    # Auth/RBAC/internal classes declare no permissions → no generic mounts.
    assert "/api/v2/user" not in prefixes
    assert "/api/v2/role" not in prefixes
    assert "/api/v2/permission" not in prefixes
    assert "/api/v2/user_role" not in prefixes
    assert "/api/v2/role_permission" not in prefixes
    assert "/api/v2/refresh_token" not in prefixes
    assert not any(p.endswith("s") and p.rsplit("/", 1)[-1] in {
        "incidents",
        "change-requests",
        "system-configs",
    } for p in prefixes)
