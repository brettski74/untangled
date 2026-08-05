"""Well-known catalog substitution and generated constants."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest

from untangled.mapping.emit_well_known import emit_python_well_known, emit_ts_well_known
from untangled.mapping.generate import generate_models
from untangled.mapping.well_known import (
    SYSTEM_CONFIG_ID,
    SYSTEM_USER_ID,
    SubstitutionError,
    substitute,
)


def test_system_config_id_is_stable() -> None:
    assert SYSTEM_CONFIG_ID == UUID("01900000-0000-7000-8000-000000000050")


def test_system_user_id_is_stable() -> None:
    assert SYSTEM_USER_ID == UUID("01900000-0000-7000-8000-000000000006")


def test_substitute_check_constraint_system_config_id() -> None:
    resolved = substitute(
        "id = '${system-config-id}'::uuid",
        "check-constraint",
    )
    assert resolved == f"id = '{SYSTEM_CONFIG_ID}'::uuid"


def test_substitute_undefined_name_fails_closed() -> None:
    with pytest.raises(SubstitutionError, match="undefined substitution"):
        substitute("id = '${no-such-name}'::uuid", "check-constraint")


def test_substitute_wrong_context_fails_closed() -> None:
    with pytest.raises(SubstitutionError, match="not available in context"):
        substitute(
            "${system-config-id}",
            "check-constraint",
            available=frozenset(),
        )


def test_system_user_id_not_available_in_check_constraint() -> None:
    with pytest.raises(SubstitutionError, match="not available in context"):
        substitute("${system-user-id}", "check-constraint")


def test_substitute_unknown_context_fails_closed() -> None:
    with pytest.raises(SubstitutionError, match="unknown substitution context"):
        substitute("${system-config-id}", "create-default")


def test_generated_constants_match_catalog(
    repo_definitions: Path, tmp_path: Path
) -> None:
    result = generate_models(repo_definitions, tmp_path / "py", tmp_path / "ts")
    py_src = result.well_known_python_path.read_text(encoding="utf-8")
    ts_src = result.well_known_ts_path.read_text(encoding="utf-8")
    assert f'SYSTEM_CONFIG_ID = UUID("{SYSTEM_CONFIG_ID}")' in py_src
    assert f'SYSTEM_USER_ID = UUID("{SYSTEM_USER_ID}")' in py_src
    assert f'export const SYSTEM_CONFIG_ID = "{SYSTEM_CONFIG_ID}";' in ts_src
    assert f'export const SYSTEM_USER_ID = "{SYSTEM_USER_ID}";' in ts_src
    assert emit_python_well_known() == py_src
    assert emit_ts_well_known() == ts_src
