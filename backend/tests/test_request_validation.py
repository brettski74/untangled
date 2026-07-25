"""Unit tests for structural vs semantic validation status classification."""

from __future__ import annotations

import pytest

from untangled.request_validation import (
    HTTP_400,
    HTTP_422,
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
