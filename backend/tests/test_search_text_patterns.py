"""Compiler-level tests for search text pattern ops (slice C)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from untangled.mapping.definition import load_definition
from untangled.persistence.search import (
    SearchNestingLimits,
    SearchSemanticError,
    SearchStructuralError,
    _compile_predicate_root,
    _escape_like_literal,
    searchable_attributes,
)

# Seeded system-config defaults — explicit for unit compiles (no DB).
_LIMITS = SearchNestingLimits(
    max_depth=3,
    max_length=20,
    max_total_predicates=50,
    max_total_regexp=3,
)


def _compile(predicate: dict[str, Any] | None, attrs: dict):
    return _compile_predicate_root(predicate, attrs, limits=_LIMITS)


@pytest.fixture
def incident_attrs(repo_root: Path) -> dict:
    definition = load_definition(
        repo_root / "backend" / "class-definitions" / "incident.yaml"
    )
    return searchable_attributes(definition)


def test_escape_like_literal_escapes_metacharacters() -> None:
    assert _escape_like_literal("a%b_c\\d") == "a\\%b\\_c\\\\d"
    assert _escape_like_literal("plain") == "plain"


def test_text_pattern_like_params_are_escaped_and_wrapped(incident_attrs: dict) -> None:
    cases = [
        ("contains", "100%_done", "%100\\%\\_done%"),
        ("starts-with", "INC%", "INC\\%%"),
        ("ends-with", "_end", "%\\_end"),
    ]
    for op, value, expected_pattern in cases:
        _where, params = _compile(
            {"op": op, "attribute": "summary", "value": value},
            incident_attrs,
        )
        assert params == [expected_pattern]


def test_regexp_binds_raw_pattern(incident_attrs: dict) -> None:
    _where, params = _compile(
        {"op": "regexp", "attribute": "summary", "value": r"^Email.*delayed$"},
        incident_attrs,
    )
    assert params == [r"^Email.*delayed$"]


def test_text_pattern_type_matrix(incident_attrs: dict) -> None:
    # text-family + friendly-id accepted (summary is ``text`` after #80)
    for op in ("contains", "starts-with", "ends-with", "regexp"):
        _compile(
            {"op": op, "attribute": "summary", "value": "x"},
            incident_attrs,
        )
        _compile(
            {"op": op, "attribute": "description", "value": "x"},
            incident_attrs,
        )
        _compile(
            {"op": op, "attribute": "status", "value": "new"},
            incident_attrs,
        )
        _compile(
            {"op": op, "attribute": "number", "value": "INC"},
            incident_attrs,
        )

    # uuid / datetime rejected
    for attribute in ("id", "created_at", "assigned_user_id"):
        for op in ("contains", "starts-with", "ends-with", "regexp"):
            with pytest.raises(SearchSemanticError, match="not applicable"):
                _compile(
                    {"op": op, "attribute": attribute, "value": "x"},
                    incident_attrs,
                )


def test_text_pattern_structural_and_null_value(incident_attrs: dict) -> None:
    with pytest.raises(SearchStructuralError, match="requires 'value'"):
        _compile(
            {"op": "contains", "attribute": "summary"},
            incident_attrs,
        )
    with pytest.raises(SearchStructuralError, match="unexpected"):
        _compile(
            {
                "op": "contains",
                "attribute": "summary",
                "value": "x",
                "extra": True,
            },
            incident_attrs,
        )
    with pytest.raises(SearchSemanticError, match="null"):
        _compile(
            {"op": "contains", "attribute": "summary", "value": None},
            incident_attrs,
        )


def test_total_regexp_limit_enforced(incident_attrs: dict) -> None:
    tree = {
        "op": "or",
        "predicates": [
            {"op": "regexp", "attribute": "summary", "value": "a"},
            {"op": "regexp", "attribute": "summary", "value": "b"},
            {"op": "regexp", "attribute": "summary", "value": "c"},
            {"op": "regexp", "attribute": "summary", "value": "d"},
        ],
    }
    with pytest.raises(SearchSemanticError, match="max_search_total_regexp"):
        _compile(tree, incident_attrs)
