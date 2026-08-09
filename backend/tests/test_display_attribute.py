"""Tests for class-scoped display_attribute metadata."""

from __future__ import annotations

from pathlib import Path

import pytest

from untangled.mapping.definition import (
    DefinitionError,
    load_definition,
    load_definitions,
    validate_platform_definitions,
)
from untangled.mapping.generate import generate_models


def _write_class(
    path: Path,
    *,
    name: str = "sample_item",
    extra_top: str = "",
    attributes: str,
) -> Path:
    path.write_text(
        "\n".join(
            [
                f"name: {name}",
                "display_name: Sample",
                "description: Sample class for display_attribute tests.",
                *([extra_top] if extra_top else []),
                "attributes:",
                attributes,
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return path


def test_user_declares_display_attribute_explicitly(repo_definitions: Path) -> None:
    user = load_definition(repo_definitions / "user.yaml")
    assert user.display_attribute is not None
    assert user.display_attribute.name_snake == "display_name"
    assert user.display_attribute.type_name == "compact_text"


def test_implicit_display_name_default(tmp_path: Path) -> None:
    path = _write_class(
        tmp_path / "sample.yaml",
        attributes="\n".join(
            [
                "  display_name:",
                "    type: compact_text",
                "    required: true",
            ]
        ),
    )
    defn = load_definition(path)
    assert defn.display_attribute is not None
    assert defn.display_attribute.name_snake == "display_name"


def test_explicit_null_suppresses_default(tmp_path: Path) -> None:
    path = _write_class(
        tmp_path / "sample.yaml",
        extra_top="display_attribute: null",
        attributes="\n".join(
            [
                "  display_name:",
                "    type: compact_text",
                "    required: true",
            ]
        ),
    )
    defn = load_definition(path)
    assert defn.display_attribute is None


def test_explicit_override(tmp_path: Path) -> None:
    path = _write_class(
        tmp_path / "sample.yaml",
        extra_top="display_attribute: title",
        attributes="\n".join(
            [
                "  title:",
                "    type: compact_text",
                "    required: true",
                "  display_name:",
                "    type: compact_text",
                "    required: true",
            ]
        ),
    )
    defn = load_definition(path)
    assert defn.display_attribute is not None
    assert defn.display_attribute.name_snake == "title"


def test_no_applicable_default(tmp_path: Path) -> None:
    path = _write_class(
        tmp_path / "sample.yaml",
        attributes="\n".join(
            [
                "  title:",
                "    type: compact_text",
                "    required: true",
            ]
        ),
    )
    defn = load_definition(path)
    assert defn.display_attribute is None


@pytest.mark.parametrize(
    ("extra_top", "attributes", "match"),
    [
        (
            "display_attribute: missing",
            "  title:\n    type: compact_text\n    required: true",
            "does not name a declared attribute",
        ),
        (
            "display_attribute: title",
            "  title:\n    type: text\n    required: true",
            "exactly 'compact_text'",
        ),
        (
            "display_attribute: Not_Snake",
            "  title:\n    type: compact_text\n    required: true",
            "snake_case",
        ),
        (
            "display_attribute: 12",
            "  title:\n    type: compact_text\n    required: true",
            "snake_case",
        ),
    ],
)
def test_rejects_invalid_explicit_display_attribute(
    tmp_path: Path,
    extra_top: str,
    attributes: str,
    match: str,
) -> None:
    path = _write_class(
        tmp_path / "sample.yaml",
        extra_top=extra_top,
        attributes=attributes,
    )
    with pytest.raises(DefinitionError, match=match):
        load_definition(path)


def test_validate_platform_requires_user(tmp_path: Path) -> None:
    _write_class(
        tmp_path / "only_item.yaml",
        name="only_item",
        attributes="  title:\n    type: compact_text\n    required: true",
    )
    definitions = load_definitions(tmp_path)
    with pytest.raises(DefinitionError, match="require a system 'user' class"):
        validate_platform_definitions(definitions)


def test_generate_emits_class_display_attribute(
    repo_definitions: Path, tmp_path: Path
) -> None:
    result = generate_models(repo_definitions, tmp_path / "py", tmp_path / "zod")
    field_meta = result.field_meta_path.read_text(encoding="utf-8")
    assert 'display_attribute: "display_name"' in field_meta
    # User declares display_attribute explicitly.
    assert '"user"' in field_meta
    user_idx = field_meta.index('"user": {')
    user_slice = field_meta[user_idx : user_idx + 800]
    assert 'display_attribute: "display_name"' in user_slice
    # Incident has no compact_text display_name attribute → null.
    incident_idx = field_meta.index('"incident": {')
    incident_slice = field_meta[incident_idx : incident_idx + 2500]
    assert "display_attribute: null" in incident_slice
