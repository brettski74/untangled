"""Tests for the snake_case definition loader (live path)."""

from __future__ import annotations

import warnings
from pathlib import Path

import pytest

from untangled.mapping.definition import (
    DefinitionError,
    DeprecatedStringTypeWarning,
    load_definition,
    load_definitions,
    validate_platform_definitions,
)
from untangled.mapping.well_known import SYSTEM_CONFIG_ID


@pytest.fixture
def snake_definitions(repo_root: Path) -> Path:
    return repo_root / "backend" / "tests" / "fixtures" / "class-definitions-snake"


def test_load_snake_fixtures(snake_definitions: Path) -> None:
    definitions = load_definitions(snake_definitions)
    validate_platform_definitions(definitions)
    by_snake = {d.name_snake: d for d in definitions}
    assert set(by_snake) == {
        "user",
        "sample_item",
        "sample_link",
        "sample_ticket",
        "singleton_config",
    }

    item = by_snake["sample_item"]
    by_attr = {a.name_snake: a for a in item.attributes}
    assert by_attr["title"].type_name == "compact_text" and by_attr["title"].required
    assert by_attr["summary"].type_name == "text"
    assert by_attr["notes"].type_name == "multiline_text"
    assert by_attr["is_active"].type_name == "boolean"
    assert by_attr["quantity"].min_value == 0 and by_attr["quantity"].max_value == 1000
    assert by_attr["unit_price"].type_name == "float"
    assert by_attr["fixed_amount"].type_name == "decimal"
    assert by_attr["due_at"].type_name == "datetime"
    assert by_attr["external_id"].type_name == "uuid"

    link = by_snake["sample_link"]
    link_attrs = {a.name_snake: a for a in link.attributes}
    assert link_attrs["sample_item_id"].references == "sample_item"

    ticket = by_snake["sample_ticket"]
    friendly = ticket.friendly_id_attr()
    assert friendly is not None
    assert friendly.type_name == "friendly_id"
    assert friendly.prefix == "SAM"
    assert friendly.pad_width == 4
    assert friendly.start_at == 1
    assert friendly.unique is True
    ticket_attrs = {a.name_snake: a for a in ticket.attributes}
    assert ticket_attrs["status"].create_default == "new"
    assert ticket_attrs["assigned_user_id"].references == "user"

    user = by_snake["user"]
    assert user.display_attribute is not None
    assert user.display_attribute.name_snake == "display_name"

    config = by_snake["singleton_config"]
    assert config.public is True
    assert config.suppress_create is True
    assert config.suppress_delete is True
    assert config.suppress_search is True
    assert config.check_constraints == (
        f"id = '{SYSTEM_CONFIG_ID}'::uuid",
        "max_items >= min_items",
    )


def test_rejects_kebab_structural_key(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample_item",
                "display-name: Bad",  # kebab structural key
                "description: x",
                "attributes: {}",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="display_name"):
        load_definition(path)


def test_rejects_kebab_class_name(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample-item",
                "display_name: Bad",
                "description: x",
                "attributes: {}",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="snake_case"):
        load_definition(path)


def test_rejects_kebab_attribute_key(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample_item",
                "display_name: Bad",
                "description: x",
                "attributes:",
                "  is-active:",
                "    type: boolean",
                "    required: true",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="snake_case"):
        load_definition(path)


def test_rejects_kebab_type_token(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample_item",
                "display_name: Bad",
                "description: x",
                "attributes:",
                "  title:",
                "    type: compact-text",
                "    required: true",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="unsupported type"):
        load_definition(path)


def test_rejects_kebab_references(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample_link",
                "display_name: Bad",
                "description: x",
                "attributes:",
                "  item_id:",
                "    type: uuid",
                "    required: true",
                "    references: sample-item",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="snake_case"):
        load_definition(path)


def test_rejects_unknown_class_reference(tmp_path: Path) -> None:
    path = tmp_path / "orphan.yaml"
    path.write_text(
        "\n".join(
            [
                "name: orphan_link",
                "display_name: Orphan",
                "description: x",
                "attributes:",
                "  item_id:",
                "    type: uuid",
                "    required: true",
                "    references: missing_class",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="unknown class"):
        load_definitions(tmp_path)


def test_rejects_duplicate_friendly_id_prefix(tmp_path: Path) -> None:
    (tmp_path / "a.yaml").write_text(
        "\n".join(
            [
                "name: ticket_a",
                "display_name: A",
                "description: x",
                "attributes:",
                "  number:",
                "    type: friendly_id",
                "    required: true",
                "    prefix: SAM",
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "b.yaml").write_text(
        "\n".join(
            [
                "name: ticket_b",
                "display_name: B",
                "description: x",
                "attributes:",
                "  number:",
                "    type: friendly_id",
                "    required: true",
                "    prefix: sam",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="collides"):
        load_definitions(tmp_path)


def test_display_attribute_must_be_compact_text(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: sample_item",
                "display_name: Bad",
                "display_attribute: quantity",
                "description: x",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="compact_text"):
        load_definition(path)


def test_deprecated_string_type_warns(tmp_path: Path) -> None:
    path = tmp_path / "legacy.yaml"
    path.write_text(
        "\n".join(
            [
                "name: legacy_item",
                "display_name: Legacy",
                "description: x",
                "attributes:",
                "  title:",
                "    type: string",
                "    required: true",
            ]
        ),
        encoding="utf-8",
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", DeprecatedStringTypeWarning)
        defn = load_definition(path)
    assert defn.attributes[0].type_name == "string"
    assert any(isinstance(w.message, DeprecatedStringTypeWarning) for w in caught)


def test_snake_loader_is_production_entrypoint() -> None:
    """Live mapping package and registry use the snake loader (#188)."""
    from untangled import mapping as mapping_pkg
    from untangled.mapping import registry

    assert mapping_pkg.load_definitions.__module__ == "untangled.mapping.definition"
    assert registry.load_definitions.__module__ == "untangled.mapping.definition"
