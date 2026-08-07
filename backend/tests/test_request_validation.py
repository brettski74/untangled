"""Unit tests for structural vs semantic validation status classification."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from untangled.request_validation import (
    HTTP_400,
    HTTP_422,
    check_violation_detail,
    status_for_validation_errors,
)


@pytest.mark.parametrize(
    ("errors", "expected"),
    [
        ([{"type": "missing", "loc": ("body", "summary")}], HTTP_400),
        ([{"type": "extra_forbidden", "loc": ("body", "number")}], HTTP_400),
        ([{"type": "json_invalid", "loc": ("body", 1)}], HTTP_400),
        ([{"type": "list_type", "loc": ("body", "sort")}], HTTP_400),
        ([{"type": "dict_type", "loc": ("body", "predicate")}], HTTP_400),
        ([{"type": "model_attributes_type", "loc": ("body",)}], HTTP_400),
        ([{"type": "model_type", "loc": ("body", "sort", 0)}], HTTP_400),
        ([{"type": "int_parsing", "loc": ("body", "limit")}], HTTP_422),
        ([{"type": "literal_error", "loc": ("body", "direction")}], HTTP_422),
        ([{"type": "greater_than_equal", "loc": ("body", "limit")}], HTTP_422),
        ([{"type": "enum", "loc": ("body", "status")}], HTTP_422),
        (
            [
                {"type": "int_parsing", "loc": ("body", "limit")},
                {"type": "extra_forbidden", "loc": ("body", "bogus")},
            ],
            HTTP_400,
        ),
        (
            [
                {"type": "int_parsing", "loc": ("body", "limit")},
                {"type": "literal_error", "loc": ("body", "direction")},
            ],
            HTTP_422,
        ),
        ([], HTTP_422),
    ],
)
def test_status_for_validation_errors(
    errors: list[dict[str, object]],
    expected: int,
) -> None:
    assert status_for_validation_errors(errors) == expected


def test_check_violation_detail_uses_primary_not_detail() -> None:
    exc = MagicMock()
    primary = (
        'new row for relation "system_config" '
        'violates check constraint "system_config_check_2"'
    )
    exc.diag = SimpleNamespace(
        message_primary=primary,
        message_detail="Failing row contains (secret-should-not-appear,)",
    )
    detail = check_violation_detail(exc)
    assert detail == primary
    assert "Failing row contains" not in detail
    assert "secret-should-not-appear" not in detail


def test_check_violation_detail_fallback_when_primary_missing() -> None:
    exc = MagicMock()
    exc.diag = SimpleNamespace(message_primary=None)
    assert check_violation_detail(exc) == "Check constraint violated."

    exc.diag = None
    assert check_violation_detail(exc) == "Check constraint violated."
