"""Cached class-definition lookup shared by mapping consumers (records, rbac)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from untangled.mapping.definition import (
    ClassDefinition,
    load_definitions,
    validate_platform_definitions,
)

DEFINITIONS_DIR_ENV = "UNTANGLED_DEFINITIONS_DIR"


def _source_tree_definitions(*, start_file: Path | None = None) -> Path | None:
    """Return class-definitions when running from ``backend/src/untangled/…``."""
    path = (start_file or Path(__file__)).resolve()
    parts = path.parts
    if len(parts) < 4:
        return None
    if parts[-4] != "src" or parts[-3] != "untangled":
        return None
    candidate = path.parents[3] / "class-definitions"
    return candidate if candidate.is_dir() else None


def resolve_definitions_dir(
    *,
    records_file: Path | None = None,
    start_file: Path | None = None,
    cwd: Path | None = None,
    environ: dict[str, str] | None = None,
) -> Path:
    """Locate YAML class-definitions (src tree, Compose ``/app``, or env)."""
    env_map = os.environ if environ is None else environ
    raw = env_map.get(DEFINITIONS_DIR_ENV)
    tried: list[Path] = []
    if raw:
        env_path = Path(raw).expanduser().resolve()
        if env_path.is_dir():
            return env_path
        tried.append(env_path)

    probe_file = start_file if start_file is not None else records_file
    source = _source_tree_definitions(start_file=probe_file)
    if source is not None:
        return source.resolve()
    if probe_file is not None:
        try:
            probe = probe_file.resolve().parents[3] / "class-definitions"
            tried.append(probe)
        except IndexError:
            pass

    cwd_path = (cwd if cwd is not None else Path.cwd()) / "class-definitions"
    tried.append(cwd_path)
    if cwd_path.is_dir():
        return cwd_path.resolve()

    tried_msg = ", ".join(str(p) for p in tried) if tried else "(none)"
    raise RuntimeError(
        "class-definitions directory not found. "
        f"Tried: {tried_msg}. "
        f"Set {DEFINITIONS_DIR_ENV} for unusual layouts."
    )


def definitions_dir() -> Path:
    """Return the class-definitions directory used at runtime."""
    return resolve_definitions_dir()


@lru_cache(maxsize=1)
def definitions_by_kebab() -> dict[str, ClassDefinition]:
    """Load and cache the platform definition set keyed by kebab class name."""
    definitions = load_definitions(definitions_dir())
    validate_platform_definitions(definitions)
    return {d.name_kebab: d for d in definitions}


def class_definition(class_kebab: str) -> ClassDefinition:
    """Return the loaded class definition for ``class_kebab``."""
    try:
        return definitions_by_kebab()[class_kebab]
    except KeyError as exc:
        raise RuntimeError(f"unknown class definition: {class_kebab}") from exc


def clear_definition_caches() -> None:
    """Drop cached definition maps (tests / unusual reloads)."""
    definitions_by_kebab.cache_clear()
