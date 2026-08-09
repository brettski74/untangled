"""Unit tests for path locator classification status codes."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from untangled.mapping.definition_snake import load_definition
from untangled.records.locator import classify_locator


def test_junk_locator_with_friendly_id_is_422(repo_definitions: Path) -> None:
    definition = load_definition(repo_definitions / "incident.yaml")
    with pytest.raises(HTTPException) as exc_info:
        classify_locator(definition, "256")
    assert exc_info.value.status_code == 422


def test_non_uuid_without_friendly_id_is_422(demo_definition) -> None:
    assert demo_definition.friendly_id_attr() is None
    with pytest.raises(HTTPException) as exc_info:
        classify_locator(demo_definition, "256")
    assert exc_info.value.status_code == 422
