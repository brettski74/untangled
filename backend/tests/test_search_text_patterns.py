"""Compiler-level tests for search text pattern ops (slice C)."""

from __future__ import annotations

from pathlib import Path

import pytest

from untangled.mapping.definition import load_definition
from untangled.persistence.search import (
    SearchSemanticError,
    SearchStructuralError,
    _compile_predicate_root,
    _escape_like_literal,
    searchable_attributes,
)


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
        _where, params = _compile_predicate_root(
            {"op": op, "attribute": "summary", "value": value},
            incident_attrs,
        )
        assert params == [expected_pattern]


def test_regexp_binds_raw_pattern(incident_attrs: dict) -> None:
    _where, params = _compile_predicate_root(
        {"op": "regexp", "attribute": "summary", "value": r"^Email.*delayed$"},
        incident_attrs,
    )
    assert params == [r"^Email.*delayed$"]


def test_text_pattern_type_matrix(incident_attrs: dict) -> None:
    # string + friendly-id accepted
    for op in ("contains", "starts-with", "ends-with", "regexp"):
        _compile_predicate_root(
            {"op": op, "attribute": "summary", "value": "x"},
            incident_attrs,
        )
        _compile_predicate_root(
            {"op": op, "attribute": "number", "value": "INC"},
            incident_attrs,
        )

    # uuid / datetime rejected
    for attribute in ("id", "created_at", "assigned_user_id"):
        for op in ("contains", "starts-with", "ends-with", "regexp"):
            with pytest.raises(SearchSemanticError, match="not applicable"):
                _compile_predicate_root(
                    {"op": op, "attribute": attribute, "value": "x"},
                    incident_attrs,
                )


def test_text_pattern_structural_and_null_value(incident_attrs: dict) -> None:
    with pytest.raises(SearchStructuralError, match="requires 'value'"):
        _compile_predicate_root(
            {"op": "contains", "attribute": "summary"},
            incident_attrs,
        )
    with pytest.raises(SearchStructuralError, match="unexpected"):
        _compile_predicate_root(
            {
                "op": "contains",
                "attribute": "summary",
                "value": "x",
                "extra": True,
            },
            incident_attrs,
        )
    with pytest.raises(SearchSemanticError, match="null"):
        _compile_predicate_root(
            {"op": "contains", "attribute": "summary", "value": None},
            incident_attrs,
        )
