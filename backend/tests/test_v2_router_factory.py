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


def test_v2_suppress_flags_omit_create_search_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from untangled.records import v2_router_factory as factory

    monkeypatch.setattr(factory, "model", lambda *_args, **_kwargs: object)
    monkeypatch.setattr(
        factory,
        "class_definition",
        lambda _name: SimpleNamespace(
            suppress_create=True,
            suppress_delete=True,
            suppress_search=True,
        ),
    )
    v2 = build_v2_class_router(
        class_kebab="singleton-item",
        prefix="/api/v2/singleton-item",
        tags=["singleton-v2"],
    )
    keys = _route_keys(v2)
    assert ("POST", "/api/v2/singleton-item") not in keys
    assert ("POST", "/api/v2/singleton-item/search") not in keys
    assert ("DELETE", "/api/v2/singleton-item/{locator}") not in keys
    assert ("GET", "/api/v2/singleton-item/{locator}") in keys
    assert ("PATCH", "/api/v2/singleton-item/{locator}") in keys


def test_v2_full_crud_routes_use_singular_class_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from untangled.records import v2_router_factory as factory

    monkeypatch.setattr(factory, "model", lambda *_args, **_kwargs: object)
    monkeypatch.setattr(
        factory,
        "class_definition",
        lambda _name: SimpleNamespace(
            suppress_create=False,
            suppress_delete=False,
            suppress_search=False,
        ),
    )
    v2 = build_v2_class_router(
        class_kebab="change_request",
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


def test_v2_mounts_include_registry_classes_beyond_legacy_allowlist() -> None:
    routers = build_v2_record_routers()
    prefixes = {router.prefix for router in routers}
    assert "/api/v2/incident" in prefixes
    assert "/api/v2/change_request" in prefixes
    assert "/api/v2/system_config" in prefixes
    # Auth/RBAC classes mount with no exclusion allowlist (#185 is follow-up).
    assert "/api/v2/user" in prefixes
    assert "/api/v2/role" in prefixes
    assert "/api/v2/permission" in prefixes
    assert not any(p.endswith("s") and p.rsplit("/", 1)[-1] in {
        "incidents",
        "change-requests",
        "system-configs",
    } for p in prefixes)
