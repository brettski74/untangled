"""Tests for friendly-id definition rules and formatting helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from untangled.mapping.definition import DefinitionError, load_definition, load_definitions
from untangled.mapping.types import format_friendly_id, friendly_id_sequence_name


def test_format_friendly_id_pads_and_overflows() -> None:
    assert format_friendly_id("CHG", 1234, 8) == "CHG00001234"
    assert format_friendly_id("INC", 1, 8) == "INC00000001"
    assert format_friendly_id("INC", 123456789, 8) == "INC123456789"


def test_sequence_name_lowercases_prefix() -> None:
    assert friendly_id_sequence_name("CHG") == "friendly_id_chg"
    assert friendly_id_sequence_name("Inc") == "friendly_id_inc"


def test_load_incident_friendly_id(repo_definitions: Path) -> None:
    definitions = load_definitions(repo_definitions)
    incident = next(d for d in definitions if d.name_kebab == "incident")
    attr = incident.friendly_id_attr()
    assert attr is not None
    assert attr.prefix == "INC"
    assert attr.pad_width == 8
    assert attr.unique is True
    assert attr.required is True


def _write_class(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")


def test_rejects_pad_width_below_min(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    _write_class(
        path,
        """
name: ticket
display-name: Ticket
description: Bad pad.
attributes:
  number:
    type: friendly-id
    required: true
    prefix: TKT
    pad-width: 3
""",
    )
    with pytest.raises(DefinitionError, match="pad-width"):
        load_definition(path)


def test_rejects_two_friendly_ids(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    _write_class(
        path,
        """
name: ticket
display-name: Ticket
description: Two friendly ids.
attributes:
  number:
    type: friendly-id
    required: true
    prefix: TKT
  alt:
    type: friendly-id
    required: true
    prefix: ALT
""",
    )
    with pytest.raises(DefinitionError, match="at most one friendly-id"):
        load_definition(path)


def test_rejects_duplicate_prefixes_case_insensitive(tmp_path: Path) -> None:
    (tmp_path / "a.yaml").write_text(
        """
name: alpha
display-name: Alpha
description: A.
attributes:
  number:
    type: friendly-id
    required: true
    prefix: INC
""",
        encoding="utf-8",
    )
    (tmp_path / "b.yaml").write_text(
        """
name: beta
display-name: Beta
description: B.
attributes:
  number:
    type: friendly-id
    required: true
    prefix: inc
""",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="case-insensitive"):
        load_definitions(tmp_path)
