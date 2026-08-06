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
        "system-config",
        "user",
        "user-role",
    }
    demo = by_kebab["demo-item"]
    assert demo.name_snake == "demo_item"
    assert demo.display_name == "Demo Item"
    assert "fixture class" in demo.description.lower()
    by_name = {attr.name_snake: attr for attr in demo.attributes}
    assert by_name["title"].type_name == "compact-text" and by_name["title"].required
    assert by_name["summary"].type_name == "compact-text" and not by_name["summary"].required
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
    assert by_name["label"].type_name == "compact-text"


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
                "    type: compact-text",
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
                "    type: compact-text",
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


def test_incident_and_change_create_defaults(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    by_kebab = {d.name_kebab: d for d in definitions}
    incident = {a.name_snake: a for a in by_kebab["incident"].attributes}
    assert incident["summary"].type_name == "text"
    assert incident["description"].type_name == "multiline-text"
    assert incident["status"].type_name == "status"
    assert incident["status"].create_default == "new"
    assert incident["severity"].type_name == "choice"
    assert incident["resolution"].type_name == "multiline-text"
    assert incident["resolution_type"].type_name == "choice"
    assert incident["summary"].create_default is None

    change = {a.name_snake: a for a in by_kebab["change-request"].attributes}
    assert change["summary"].type_name == "text"
    assert change["description"].type_name == "multiline-text"
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
                f"{defn.name_kebab}.{attr.name_kebab} still uses deprecated string"
            )


def test_deprecated_string_emits_warning(tmp_path: Path) -> None:
    path = tmp_path / "legacy.yaml"
    path.write_text(
        "\n".join(
            [
                "name: legacy-item",
                "display-name: Legacy",
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
                "name: null-default",
                "display-name: \"Null default\"",
                "description: Null create-default.",
                "attributes:",
                "  status:",
                "    type: status",
                "    required: true",
                "    create-default: null",
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
                "name: bad-uuid",
                "display-name: Bad",
                "description: Bad UUID default.",
                "attributes:",
                "  owner-id:",
                "    type: uuid",
                "    required: true",
                "    create-default: not-a-uuid",
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
                "name: bad-fid",
                "display-name: Bad",
                "description: Friendly-id create-default.",
                "attributes:",
                "  number:",
                "    type: friendly-id",
                "    required: true",
                "    prefix: BAD",
                "    create-default: BAD00000001",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="create-default"):
        load_definition(path)


def test_class_flags_default_false(repo_definitions: Path) -> None:
    demo = load_definition(repo_definitions / "demo-item.yaml")
    assert demo.public is False
    assert demo.suppress_create is False
    assert demo.suppress_delete is False
    assert demo.suppress_search is False
    assert demo.check_constraints == ()


def test_public_and_suppress_and_check_constraint(tmp_path: Path) -> None:
    path = tmp_path / "bounded.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bounded-item",
                "display-name: Bounded",
                "description: Flags and check constraint.",
                "public: true",
                "suppress-create: true",
                "suppress-delete: true",
                "suppress-search: true",
                "check-constraint: \"id = '${system-config-id}'::uuid\"",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
                "    min-value: 1",
                "    max-value: 10",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    defn = load_definition(path)
    assert defn.public is True
    assert defn.suppress_create is True
    assert defn.suppress_delete is True
    assert defn.suppress_search is True
    assert defn.check_constraints == (
        "id = '01900000-0000-7000-8000-000000000050'::uuid",
    )
    attr = defn.attributes[0]
    assert attr.min_value == 1
    assert attr.max_value == 10


def test_min_max_rejects_non_numeric_and_inverted(tmp_path: Path) -> None:
    bad_type = tmp_path / "text-bound.yaml"
    bad_type.write_text(
        "\n".join(
            [
                "name: text-bound",
                "display-name: Text",
                "description: Bounds on text.",
                "attributes:",
                "  title:",
                "    type: compact-text",
                "    required: true",
                "    min-value: 1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="min-value/max-value"):
        load_definition(bad_type)

    inverted = tmp_path / "inverted.yaml"
    inverted.write_text(
        "\n".join(
            [
                "name: inverted",
                "display-name: Inverted",
                "description: min greater than max.",
                "attributes:",
                "  quantity:",
                "    type: integer",
                "    required: true",
                "    min-value: 10",
                "    max-value: 1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="min-value must be <= max-value"):
        load_definition(inverted)


def test_check_constraint_undefined_substitution(tmp_path: Path) -> None:
    path = tmp_path / "bad-check.yaml"
    path.write_text(
        "\n".join(
            [
                "name: bad-check",
                "display-name: Bad",
                "description: Unknown token.",
                "check-constraint: \"id = '${current-user}'::uuid\"",
                "attributes:",
                "  title:",
                "    type: compact-text",
                "    required: true",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="undefined substitution"):
        load_definition(path)
