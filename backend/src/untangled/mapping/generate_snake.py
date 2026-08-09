"""Snake generate pipeline: snake definitions → Pydantic + Zod + field meta.

Live ``make models`` / CLI / runtime regen path (#188). The kebab generate
modules remain in-tree unused by production until child 5.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.definition_snake import (
    load_definitions,
    validate_platform_definitions,
)
from untangled.mapping.emit_field_meta_snake import write_field_meta
from untangled.mapping.emit_pydantic_snake import write_pydantic_models
from untangled.mapping.emit_well_known_snake import (
    write_python_well_known,
    write_ts_well_known,
)
from untangled.mapping.emit_zod_snake import write_zod_models


@dataclass(frozen=True, slots=True)
class GenerateResult:
    """Outputs from a snake generate run."""

    definitions: tuple[ClassDefinition, ...]
    pydantic_paths: tuple[Path, ...]
    zod_paths: tuple[Path, ...]
    field_meta_path: Path
    well_known_python_path: Path
    well_known_ts_path: Path


def generate_models_snake(
    definitions_dir: Path,
    pydantic_out: Path,
    zod_out: Path,
) -> GenerateResult:
    """Load snake definitions and write generated modules to the given dirs."""
    definitions = load_definitions(definitions_dir)
    validate_platform_definitions(definitions)
    pydantic_paths = write_pydantic_models(definitions, pydantic_out)
    zod_paths = write_zod_models(definitions, zod_out)
    field_meta_path = write_field_meta(definitions, zod_out)
    well_known_python_path = write_python_well_known(pydantic_out)
    well_known_ts_path = write_ts_well_known(zod_out)
    return GenerateResult(
        definitions=tuple(definitions),
        pydantic_paths=tuple(pydantic_paths),
        zod_paths=tuple(zod_paths),
        field_meta_path=field_meta_path,
        well_known_python_path=well_known_python_path,
        well_known_ts_path=well_known_ts_path,
    )
