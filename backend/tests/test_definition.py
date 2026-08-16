"""Tests for YAML class definition loading and validation."""

import warnings
from pathlib import Path

import pytest

from untangled.mapping.definition import (
    DefinitionError,
    DeprecatedStringTypeWarning,
    load_definition,
    load_definitions,
)
from untangled.seed.users import SEED_ADMIN_ID


def test_load_demo_item(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    by_class = {d.name_snake: d for d in definitions}
    assert set(by_class) == {
        "change_request",
        "demo_item",
        "demo_link",
        "incident",
        "permission",
        "refresh_token",
        "role",
        "role_permission",
        "system_config",
        "user",
        "user_role",
    }
    demo = by_class["demo_item"]
    assert demo.name_snake == "demo_item"
    assert demo.display_name == "Demo Item"
    assert "fixture class" in demo.description.lower()
    by_attr = {attr.name_snake: attr for attr in demo.attributes}
    assert by_attr["title"].type_name == "compact_text" and by_attr["title"].required
    assert by_attr["summary"].type_name == "compact_text" and not by_attr["summary"].required
    assert by_attr["is_active"].type_name == "boolean"
    assert by_attr["quantity"].type_name == "integer"
    assert by_attr["unit_price"].type_name == "float"
    assert by_attr["fixed_amount"].type_name == "decimal"
    assert by_attr["due_at"].type_name == "datetime"

    user = by_class["user"]
    user_attrs = {attr.name_snake: attr for attr in user.attributes}
    assert user_attrs["username"].unique is True
    assert user_attrs["password_hash"].unique is False

    role = by_class["role"]
    role_attrs = {attr.name_snake: attr for attr in role.attributes}
    assert role_attrs["name"].unique is True
    permission = by_class["permission"]
    perm_attrs = {attr.name_snake: attr for attr in permission.attributes}
    assert perm_attrs["key"].unique is True
    user_role = by_class["user_role"]
    ur_attrs = {attr.name_snake: attr for attr in user_role.attributes}
    assert ur_attrs["user_id"].references == "user"
    assert ur_attrs["role_id"].references == "role"


def test_load_demo_link_fk(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    link = next(d for d in definitions if d.name_snake == "demo_link")
    by_name = {attr.name_snake: attr for attr in link.attributes}
    assert by_name["demo_item_id"].type_name == "uuid"
    assert by_name["demo_item_id"].required
    assert by_name["demo_item_id"].references == "demo_item"
    assert by_name["label"].type_name == "compact_text"


@pytest.mark.parametrize(
    "field_name",
    ["id", "created_at", "updated_at", "created_by", "updated_by"],
)
def test_rejects_redefined_system_fields(tmp_path: Path, field_name: str) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: clash_item",
                "display_name: Clash",
                "description: Clash test.",
                "attributes:",
                f"  {field_name}:",
                "    type: compact_text",
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
                "name: bad_item",
                "display_name: Bad",
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
        "name: bare_item\ndescription: Missing display name.\nattributes: {}\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="display_name"):
        load_definition(path)


def test_rejects_missing_description(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "name: bare_item\ndisplay_name: Bare\nattributes: {}\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="description"):
        load_definition(path)


def test_rejects_unknown_references(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text(
        "\n".join(
            [
                "name: orphan_link",
                "display_name: Orphan",
                "description: Bad reference.",
                "attributes:",
                "  parent_id:",
                "    type: uuid",
                "    required: true",
                "    references: missing_class",
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
                "name: bad_ref",
                "display_name: Bad",
                "description: Non-uuid reference.",
                "attributes:",
                "  parent_id:",
                "    type: compact_text",
                "    required: true",
                "    references: bad_ref",
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


def test_incident_and_change_create_defaults(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    by_name = {d.name_snake: d for d in definitions}
    incident = {a.name_snake: a for a in by_name["incident"].attributes}
    assert incident["summary"].type_name == "text"
    assert incident["description"].type_name == "multiline_text"
    assert incident["status"].type_name == "status"
    assert incident["status"].create_default == "new"
    assert incident["severity"].type_name == "choice"
    assert incident["resolution"].type_name == "multiline_text"
    assert incident["resolution_type"].type_name == "choice"
    assert incident["summary"].create_default is None

    change = {a.name_snake: a for a in by_name["change_request"].attributes}
    assert change["summary"].type_name == "text"
    assert change["description"].type_name == "multiline_text"
    assert change["status"].type_name == "status"
    assert change["status"].create_default == "draft"
    assert change["requested_by"].create_default == str(SEED_ADMIN_ID)


def test_first_party_definitions_have_no_deprecated_string(
    repo_definitions: Path,
) -> None:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", DeprecatedStringTypeWarning)
        definitions = load_definitions(repo_definitions)
    assert not any(isinstance(w.message, DeprecatedStringTypeWarning) for w in caught)
    for defn in definitions:
        for attr in defn.attributes:
            assert attr.type_name != "string", (
                f"{defn.name_snake}.{attr.name_snake} still uses deprecated string"
            )


def test_deprecated_string_emits_warning(tmp_path: Path) -> None:
    path = tmp_path / "legacy.yaml"
    path.write_text(
        "\n".join(
            [
                "name: legacy_item",
                "display_name: Legacy",
                "description: Still on string.",
                "attributes:",
                "  label:",
                "    type: string",
                "    required: true",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.warns(DeprecatedStringTypeWarning, match="deprecated type 'string'"):
        defn = load_definition(path)
    assert defn.attributes[0].type_name == "string"


def test_create_default_rejects_null_and_bad_uuid(tmp_path: Path) -> None:
    null_path = tmp_path / "null-default.yaml"
    null_path.write_text(
        "\n".join(
            [
                "name: null_default",
                "display_name: \"Null default\"",
                "description: Null create_default.",
                "attributes:",
                "  status:",
                "    type: status",
                "    required: true",
                "    create_default: null",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="must not be null"):
        load_definition(null_path)

    bad_uuid = tmp_path / "bad-uuid.yaml"
    bad_uuid.write_text(
        "\n".join(
            [
                "name: bad_uuid",
                "display_name: Bad",
                "description: Bad UUID default.",
                "attributes:",
                "  owner_id:",
                "    type: uuid",
                "    required: true",
                "    create_default: not-a-uuid",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="not a valid UUID"):
        load_definition(bad_uuid)


def test_create_default_forbidden_on_friendly_id(tmp_path: Path) -> None:
    path = tmp_path / "bad-fid.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad_fid",
                "display_name: Bad",
                "description: Friendly-id create_default.",
                "attributes:",
                "  number:",
                "    type: friendly_id",
                "    required: true",
                "    prefix: BAD",
                "    create_default: BAD00000001",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="create_default"):
        load_definition(path)


def test_class_flags_default_empty_permissions(repo_definitions: Path) -> None:
    user = load_definition(repo_definitions / "user.yaml")
    assert user.public is False
    assert user.permissions == ()
    assert user.check_constraints == ("username ~ '^[a-z0-9_]{3,32}$'::text",)


def test_public_and_permissions_and_check_constraint(tmp_path: Path) -> None:
    path = tmp_path / "bounded.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bounded_item",
                "display_name: Bounded",
                "description: Flags and check constraint.",
                "public: true",
                "permissions:",
                "  - read",
                "  - update",
                "check_constraint: \"id = '${system_config_id}'::uuid\"",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
                "    min_value: 1",
                "    max_value: 10",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    defn = load_definition(path)
    assert defn.public is True
    assert defn.permissions == ("read", "update")
    assert defn.check_constraints == (
        "id = '01900000-0000-7000-8000-000000000050'::uuid",
    )
    attr = defn.attributes[0]
    assert attr.min_value == 1
    assert attr.max_value == 10


def test_public_requires_read_or_search(tmp_path: Path) -> None:
    path = tmp_path / "bad_public.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad_public",
                "display_name: Bad",
                "description: Public without read/search.",
                "public: true",
                "permissions:",
                "  - update",
                "attributes: {}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="public: true requires"):
        load_definition(path)


def test_min_max_rejects_non_numeric_and_inverted(tmp_path: Path) -> None:
    bad_type = tmp_path / "text-bound.yaml"
    bad_type.write_text(
        "\n".join(
            [
                "name: text_bound",
                "display_name: Text",
                "description: Bounds on text.",
                "attributes:",
                "  title:",
                "    type: compact_text",
                "    required: true",
                "    min_value: 1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="min_value/max_value"):
        load_definition(bad_type)

    inverted = tmp_path / "inverted.yaml"
    inverted.write_text(
        "\n".join(
            [
                "name: inverted",
                "display_name: Inverted",
                "description: min greater than max.",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
                "    min_value: 10",
                "    max_value: 1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="min_value must be <= max_value"):
        load_definition(inverted)


def test_check_constraint_undefined_substitution(tmp_path: Path) -> None:
    path = tmp_path / "bad-check.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad_check",
                "display_name: Bad",
                "description: Unknown token.",
                "check_constraint: \"id = '${current_user}'::uuid\"",
                "attributes:",
                "  title:",
                "    type: compact_text",
                "    required: true",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="undefined substitution"):
        load_definition(path)
