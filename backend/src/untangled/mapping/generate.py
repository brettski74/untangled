"""Reusable generate pipeline: class definitions → Pydantic + Zod artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.emit_pydantic import write_pydantic_models
from untangled.mapping.emit_zod import write_zod_models


@dataclass(frozen=True, slots=True)
class GenerateResult:
    """Outputs from a generate run."""

    definitions: tuple[ClassDefinition, ...]
    pydantic_paths: tuple[Path, ...]
    zod_paths: tuple[Path, ...]


def generate_models(
    definitions_dir: Path,
    pydantic_out: Path,
    zod_out: Path,
) -> GenerateResult:
    """Load definitions from ``definitions_dir`` and write Pydantic + Zod modules.

    Inputs and outputs are paths so the same pipeline can be invoked for core
    fixtures or a later custom-class product feature without a rewrite.
    """
    definitions = load_definitions(definitions_dir)
    pydantic_paths = write_pydantic_models(definitions, pydantic_out)
    zod_paths = write_zod_models(definitions, zod_out)
    return GenerateResult(
        definitions=tuple(definitions),
        pydantic_paths=tuple(pydantic_paths),
        zod_paths=tuple(zod_paths),
    )
