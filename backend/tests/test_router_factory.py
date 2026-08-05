"""Router factory honouring suppress flags from class definitions."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from untangled.records.router_factory import build_class_router


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


def test_suppress_flags_omit_create_search_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from untangled.records import router_factory as factory

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
    legacy = build_class_router(
        class_kebab="singleton-item",
        prefix="/singleton-items",
        tags=["singleton"],
        surface="legacy",
    )
    v1 = build_class_router(
        class_kebab="singleton-item",
        prefix="/api/v1/singleton-items",
        tags=["singleton-v1"],
        surface="v1",
    )
    assert ("POST", "/singleton-items") not in _route_keys(legacy)
    assert ("POST", "/singleton-items/search") not in _route_keys(legacy)
    assert ("DELETE", "/singleton-items/{locator}") not in _route_keys(legacy)
    assert ("GET", "/singleton-items/{locator}") in _route_keys(legacy)
    assert ("PATCH", "/singleton-items/{locator}") in _route_keys(legacy)
    assert ("POST", "/api/v1/singleton-items/search") not in _route_keys(v1)
    assert ("GET", "/api/v1/singleton-items/{locator}") in _route_keys(v1)
