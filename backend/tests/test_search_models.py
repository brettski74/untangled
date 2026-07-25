"""Unit tests for hand-authored search protocol models (no DB)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from untangled.persistence.search import SearchableAttribute, _resolve_sort
from untangled.records.search_models import SortSpec


def _direction_schema_leaves() -> list[dict]:
    props = SortSpec.model_json_schema()["properties"]["direction"]
    if "anyOf" in props:
        return list(props["anyOf"])
    if "oneOf" in props:
        return list(props["oneOf"])
    return [props]


def test_sort_spec_direction_schema_is_nullable_enum() -> None:
    """Published schema must list asc|desc and declare null explicitly."""
    leaves = _direction_schema_leaves()
    assert any(leaf.get("enum") == ["asc", "desc"] for leaf in leaves)
    assert any(leaf.get("type") == "null" for leaf in leaves)
    assert SortSpec.model_json_schema()["properties"]["direction"].get("default") == "asc"


def test_sort_spec_omit_and_null_default_to_asc() -> None:
    assert SortSpec.model_validate({"attribute": "status"}).direction == "asc"
    assert (
        SortSpec.model_validate({"attribute": "status", "direction": None}).direction
        == "asc"
    )
    assert (
        SortSpec.model_validate({"attribute": "status", "direction": "desc"}).direction
        == "desc"
    )


def test_sort_spec_direction_is_case_sensitive() -> None:
    for bad in ("ASC", "DESC", "Asc", "deSc", "sideways"):
        with pytest.raises(ValidationError):
            SortSpec.model_validate({"attribute": "status", "direction": bad})


def test_resolve_sort_rejects_bad_direction_as_programming_error() -> None:
    """HTTP edge validates direction; a bad tuple into persistence is a bug."""
    attrs = {"status": SearchableAttribute("status", "string")}
    with pytest.raises(RuntimeError, match="invalid sort direction"):
        _resolve_sort([("status", "ASC")], attrs)  # type: ignore[list-item]
