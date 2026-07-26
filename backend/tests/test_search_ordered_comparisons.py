"""Compiler-level tests for search ordered comparison ops (slice B)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from psycopg import sql

from untangled.mapping.definition import load_definition
from untangled.persistence.search import (
    SearchableAttribute,
    SearchSemanticError,
    SearchStructuralError,
    _compile_predicate_root,
    searchable_attributes,
)


@pytest.fixture
def incident_attrs(repo_root: Path) -> dict[str, SearchableAttribute]:
    definition = load_definition(
        repo_root / "backend" / "class-definitions" / "incident.yaml"
    )
    return searchable_attributes(definition)


@pytest.fixture
def change_attrs(repo_root: Path) -> dict[str, SearchableAttribute]:
    definition = load_definition(
        repo_root / "backend" / "class-definitions" / "change-request.yaml"
    )
    return searchable_attributes(definition)


def _sql_text(fragment: sql.Composable) -> str:
    """Render a SQL fragment for white-box assertions (identifiers unquoted)."""
    return fragment.as_string(None)


def test_ordered_ops_compile_on_applicable_types(
    incident_attrs: dict[str, SearchableAttribute],
    change_attrs: dict[str, SearchableAttribute],
) -> None:
    cases: list[tuple[dict[str, SearchableAttribute], str, object]] = [
        (incident_attrs, "summary", "m"),
        (incident_attrs, "number", "INC"),
        (incident_attrs, "created_at", datetime(2020, 1, 1, tzinfo=timezone.utc)),
        (change_attrs, "risk_score", 50),
    ]
    for attrs, attribute, value in cases:
        for op in ("gt", "gte", "lt", "lte"):
            _where, params = _compile_predicate_root(
                {"op": op, "attribute": attribute, "value": value},
                attrs,
            )
            assert params == [value]


def test_ordered_ops_accept_numeric_and_decimal_via_type_gate() -> None:
    """float/decimal: type-gate + coerce only (no product column / Postgres claim)."""
    attrs = {
        "qty": SearchableAttribute("qty", "integer"),
        "rate": SearchableAttribute("rate", "float"),
        "amount": SearchableAttribute("amount", "decimal"),
    }
    _compile_predicate_root({"op": "gt", "attribute": "qty", "value": 1}, attrs)
    _compile_predicate_root({"op": "gte", "attribute": "rate", "value": 1.5}, attrs)
    _where, params = _compile_predicate_root(
        {"op": "lt", "attribute": "amount", "value": "10.50"},
        attrs,
    )
    assert params == [Decimal("10.50")]


def test_text_ordered_ops_emit_collate_c(
    incident_attrs: dict[str, SearchableAttribute],
) -> None:
    where, _params = _compile_predicate_root(
        {"op": "gt", "attribute": "summary", "value": "a"},
        incident_attrs,
    )
    rendered = _sql_text(where)
    assert 'COLLATE "C"' in rendered
    assert ">" in rendered

    where_dt, _ = _compile_predicate_root(
        {
            "op": "gt",
            "attribute": "created_at",
            "value": datetime(2020, 1, 1, tzinfo=timezone.utc),
        },
        incident_attrs,
    )
    assert 'COLLATE "C"' not in _sql_text(where_dt)


def test_ordered_ops_type_rejection(
    incident_attrs: dict[str, SearchableAttribute],
) -> None:
    for attribute in ("id", "assigned_user_id", "major_incident"):
        for op in ("gt", "gte", "lt", "lte"):
            with pytest.raises(SearchSemanticError, match="not applicable"):
                _compile_predicate_root(
                    {"op": op, "attribute": attribute, "value": "x"},
                    incident_attrs,
                )

    # boolean without a real column still rejected by the type gate
    attrs = {**incident_attrs, "flag": SearchableAttribute("flag", "boolean")}
    with pytest.raises(SearchSemanticError, match="not applicable"):
        _compile_predicate_root(
            {"op": "gt", "attribute": "flag", "value": True},
            attrs,
        )


def test_ordered_ops_structural_and_value_errors(
    incident_attrs: dict[str, SearchableAttribute],
) -> None:
    with pytest.raises(SearchStructuralError, match="requires 'value'"):
        _compile_predicate_root(
            {"op": "gt", "attribute": "summary"},
            incident_attrs,
        )
    with pytest.raises(SearchStructuralError, match="unexpected"):
        _compile_predicate_root(
            {
                "op": "gt",
                "attribute": "summary",
                "value": "a",
                "extra": True,
            },
            incident_attrs,
        )
    with pytest.raises(SearchSemanticError, match="null"):
        _compile_predicate_root(
            {"op": "gt", "attribute": "summary", "value": None},
            incident_attrs,
        )
    with pytest.raises(SearchSemanticError, match="invalid"):
        _compile_predicate_root(
            {"op": "gt", "attribute": "summary", "value": ["not", "a", "string"]},
            incident_attrs,
        )
    with pytest.raises(SearchSemanticError, match="invalid"):
        _compile_predicate_root(
            {
                "op": "gt",
                "attribute": "created_at",
                "value": "not-a-datetime",
            },
            incident_attrs,
        )
