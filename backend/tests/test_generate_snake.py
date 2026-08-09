"""Behavioural tests for the dark snake generate pipeline (#187)."""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from untangled.mapping.generate import generate_models
from untangled.mapping.well_known import SYSTEM_CONFIG_ID


@pytest.fixture
def snake_definitions(repo_root: Path) -> Path:
    return repo_root / "backend" / "tests" / "fixtures" / "class-definitions-snake"


def _load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_generate_snake_writes_artifacts(
    snake_definitions: Path, tmp_path: Path
) -> None:
    pydantic_out = tmp_path / "pydantic"
    zod_out = tmp_path / "zod"
    result = generate_models(snake_definitions, pydantic_out, zod_out)

    assert {d.name_snake for d in result.definitions} == {
        "user",
        "sample_item",
        "sample_link",
        "sample_ticket",
        "singleton_config",
    }
    assert (pydantic_out / "sample_item.py").is_file()
    assert (pydantic_out / "sample_ticket.py").is_file()
    assert (pydantic_out / "user.py").is_file()
    assert (zod_out / "sample_item.ts").is_file()
    assert (zod_out / "sample_ticket.ts").is_file()
    assert result.field_meta_path.is_file()
    assert result.well_known_python_path.is_file()
    assert result.well_known_ts_path.is_file()

    field_meta = result.field_meta_path.read_text(encoding="utf-8")
    # Map is keyed by snake class name (authoritative); synthetic kebab may still appear.
    assert '  "sample_ticket": {' in field_meta
    assert "class_field_meta(class_name: string," in field_meta
    assert 'friendly_id_attr: "number"' in field_meta
    assert 'type_name: "friendly_id"' in field_meta
    assert 'type_name: "compact_text"' in field_meta
    assert 'references: "sample_item"' in field_meta
    assert 'create_default: "new"' in field_meta
    assert 'display_attribute: "display_name"' in field_meta

    ticket_src = (pydantic_out / "sample_ticket.py").read_text(encoding="utf-8")
    assert "number: str" in ticket_src
    assert "status: str" in ticket_src

    well_known_py = result.well_known_python_path.read_text(encoding="utf-8")
    assert "SYSTEM_CONFIG_ID" in well_known_py
    assert str(SYSTEM_CONFIG_ID) in well_known_py

    well_known_ts = result.well_known_ts_path.read_text(encoding="utf-8")
    assert '"system_config_id"' in well_known_ts
    assert '"check_constraint"' in well_known_ts


def test_generate_snake_pydantic_accepts_payload(
    snake_definitions: Path, tmp_path: Path
) -> None:
    pydantic_out = tmp_path / "pydantic"
    zod_out = tmp_path / "zod"
    generate_models(snake_definitions, pydantic_out, zod_out)
    module = _load_module(pydantic_out / "sample_item.py", "snake_sample_item")
    payload = {
        "id": "01901234-5678-7abc-89ab-cdef01234567",
        "created_at": datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 18, 12, 30, tzinfo=timezone.utc),
        "created_by": "01901234-5678-7abc-89ab-cdef01234568",
        "updated_by": "01901234-5678-7abc-89ab-cdef01234569",
        "title": "Widget",
        "summary": "A sample row",
        "notes": None,
        "is_active": True,
        "quantity": 3,
        "unit_price": 1.5,
        "fixed_amount": Decimal("19.99"),
        "due_at": datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc),
        "external_id": None,
    }
    model = module.SampleItem.model_validate(payload)
    assert model.title == "Widget"
    assert model.quantity == 3

    with pytest.raises(ValidationError):
        module.SampleItem.model_validate({**payload, "quantity": "nope"})


def test_production_generate_uses_snake_loader(
    repo_definitions: Path, tmp_path: Path
) -> None:
    """Session/CLI generate path is the snake pipeline (#188)."""
    from untangled.mapping import generate_models

    result = generate_models(repo_definitions, tmp_path / "p", tmp_path / "z")
    demo = next(d for d in result.definitions if d.name_snake == "demo_item")
    title = next(a for a in demo.attributes if a.name_snake == "title")
    assert title.type_name == "compact_text"

