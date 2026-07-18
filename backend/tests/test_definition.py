"""Tests for YAML class definition loading and validation."""

from pathlib import Path

import pytest

from untangled.mapping.definition import DefinitionError, load_definition, load_definitions


def test_load_demo_item(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    assert len(definitions) == 1
    demo = definitions[0]
    assert demo.name_kebab == "demo-item"
    assert demo.name_snake == "demo_item"
    assert demo.display_name == "Demo Item"
    assert "fixture class" in demo.description.lower()
    by_name = {attr.name_snake: attr for attr in demo.attributes}
    assert by_name["title"].type_name == "string" and by_name["title"].required
    assert by_name["summary"].type_name == "string" and not by_name["summary"].required
    assert by_name["is_active"].type_name == "boolean"
    assert by_name["quantity"].type_name == "integer"
    assert by_name["unit_price"].type_name == "float"
    assert by_name["fixed_amount"].type_name == "decimal"
    assert by_name["due_at"].type_name == "datetime"


@pytest.mark.parametrize(
    "field_kebab",
    ["id", "created-at", "updated-at", "created-by", "updated-by"],
)
def test_rejects_redefined_system_fields(tmp_path: Path, field_kebab: str) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: clash-item",
                "display-name: Clash",
                "description: Clash test.",
                "attributes:",
                f"  {field_kebab}:",
                "    type: string",
                "    required: true",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="conflicts with injected system field"):
        load_definition(path)


def test_rejects_unknown_type(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad-item",
                "display-name: Bad",
                "description: Bad type test.",
                "attributes:",
                "  label:",
                "    type: blob",
                "    required: true",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="unsupported type"):
        load_definition(path)


def test_rejects_missing_display_name(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "name: bare-item\ndescription: Missing display name.\nattributes: {}\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="display-name"):
        load_definition(path)


def test_rejects_missing_description(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "name: bare-item\ndisplay-name: Bare\nattributes: {}\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="description"):
        load_definition(path)


def test_load_definitions_requires_directory(tmp_path: Path) -> None:
    missing = tmp_path / "nope"
    with pytest.raises(DefinitionError, match="does not exist"):
        load_definitions(missing)
