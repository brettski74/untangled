"""Tests for YAML class definition loading and validation."""

from pathlib import Path

import pytest

from untangled.mapping.definition import DefinitionError, load_definition, load_definitions


def test_load_demo_item(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    by_kebab = {d.name_kebab: d for d in definitions}
    assert set(by_kebab) == {
        "change-request",
        "demo-item",
        "demo-link",
        "incident",
        "permission",
        "refresh-token",
        "role",
        "role-permission",
        "user",
        "user-role",
    }
    demo = by_kebab["demo-item"]
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

    user = by_kebab["user"]
    user_attrs = {attr.name_snake: attr for attr in user.attributes}
    assert user_attrs["username"].unique is True
    assert user_attrs["password_hash"].unique is False

    role = by_kebab["role"]
    role_attrs = {attr.name_snake: attr for attr in role.attributes}
    assert role_attrs["name"].unique is True
    permission = by_kebab["permission"]
    perm_attrs = {attr.name_snake: attr for attr in permission.attributes}
    assert perm_attrs["key"].unique is True
    user_role = by_kebab["user-role"]
    ur_attrs = {attr.name_snake: attr for attr in user_role.attributes}
    assert ur_attrs["user_id"].references == "user"
    assert ur_attrs["role_id"].references == "role"


def test_load_demo_link_fk(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    link = next(d for d in definitions if d.name_kebab == "demo-link")
    by_name = {attr.name_snake: attr for attr in link.attributes}
    assert by_name["demo_item_id"].type_name == "uuid"
    assert by_name["demo_item_id"].required
    assert by_name["demo_item_id"].references == "demo-item"
    assert by_name["label"].type_name == "string"


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


def test_rejects_unknown_references(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: orphan-link",
                "display-name: Orphan",
                "description: Bad reference.",
                "attributes:",
                "  parent-id:",
                "    type: uuid",
                "    required: true",
                "    references: missing-class",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="unknown class"):
        load_definitions(tmp_path)


def test_rejects_references_on_non_uuid(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad-ref",
                "display-name: Bad",
                "description: Non-uuid reference.",
                "attributes:",
                "  parent-id:",
                "    type: string",
                "    required: true",
                "    references: bad-ref",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="must have type uuid"):
        load_definition(path)


def test_load_definitions_requires_directory(tmp_path: Path) -> None:
    missing = tmp_path / "nope"
    with pytest.raises(DefinitionError, match="does not exist"):
        load_definitions(missing)
