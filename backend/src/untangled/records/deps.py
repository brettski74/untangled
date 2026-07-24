"""Shared helpers for domain record routers."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from psycopg import Connection
from pydantic import BaseModel

import untangled
from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.generate import generate_models
from untangled.mapping.naming import snake_to_pascal
from untangled.persistence.store import RecordStore
from untangled.records.locator import classify_locator

DEFINITIONS_DIR_ENV = "UNTANGLED_DEFINITIONS_DIR"


def _source_tree_definitions(*, records_file: Path | None = None) -> Path | None:
    """Return class-definitions when running from ``backend/src/untangled/records``."""
    path = (records_file or Path(__file__)).resolve()
    parts = path.parts
    if len(parts) < 4:
        return None
    if parts[-3:] != ("untangled", "records", path.name):
        return None
    if parts[-4] != "src":
        return None
    candidate = path.parents[3] / "class-definitions"
    return candidate if candidate.is_dir() else None


def resolve_definitions_dir(
    *,
    records_file: Path | None = None,
    cwd: Path | None = None,
    environ: dict[str, str] | None = None,
) -> Path:
    """Locate YAML class-definitions for runtime (src tree, Compose ``/app``, or env)."""
    env_map = os.environ if environ is None else environ
    raw = env_map.get(DEFINITIONS_DIR_ENV)
    tried: list[Path] = []
    if raw:
        env_path = Path(raw).expanduser().resolve()
        if env_path.is_dir():
            return env_path
        tried.append(env_path)

    source = _source_tree_definitions(records_file=records_file)
    if source is not None:
        return source.resolve()
    if records_file is not None:
        # Still record the would-be source path for error messages when probing.
        probe = records_file.resolve().parents[3] / "class-definitions"
        tried.append(probe)

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
    """Return the class-definitions directory used by record routers and seeds."""
    return resolve_definitions_dir()


def resolve_pydantic_out(*, package_root: Path | None = None) -> Path:
    """Return the importable ``untangled.generated`` directory."""
    root = package_root
    if root is None:
        root = Path(untangled.__file__).resolve().parent
    return root / "generated"


def _pydantic_out() -> Path:
    return resolve_pydantic_out()


def _has_create_models(out: Path) -> bool:
    incident = out / "incident.py"
    return incident.is_file() and "class IncidentCreate" in incident.read_text(
        encoding="utf-8"
    )


@lru_cache(maxsize=1)
def ensure_generated_package() -> None:
    """Ensure Create/Update models exist; regen only from a monorepo src tree."""
    out = resolve_pydantic_out()
    if _has_create_models(out):
        return
    if _source_tree_definitions() is None:
        raise RuntimeError(
            "untangled.generated is missing Create/Update models. "
            "Rebuild the API image (bake models at build time) or run `make models` "
            "for local src development."
        )
    zod_tmp = out.parent / ".zod-generated-tmp"
    generate_models(resolve_definitions_dir(), out, zod_tmp)


@lru_cache(maxsize=1)
def _definitions_by_kebab() -> dict[str, ClassDefinition]:
    return {d.name_kebab: d for d in load_definitions(definitions_dir())}


def class_definition(class_kebab: str) -> ClassDefinition:
    """Return the loaded class definition for ``class_kebab``."""
    try:
        return _definitions_by_kebab()[class_kebab]
    except KeyError as exc:
        raise RuntimeError(f"unknown class definition: {class_kebab}") from exc


def model(class_kebab: str, suffix: str = "") -> type[BaseModel]:
    """Return a generated Pydantic model (full, Create, or Update)."""
    ensure_generated_package()
    from untangled import generated as gen  # type: ignore[attr-defined]

    pascal = snake_to_pascal(class_definition(class_kebab).name_snake)
    return getattr(gen, f"{pascal}{suffix}")


def record_store(
    conn: Connection,
    class_kebab: str,
    *,
    actor_id: UUID,
) -> RecordStore[Any]:
    """Build a RecordStore for ``class_kebab`` with the authenticated actor."""
    definition = class_definition(class_kebab)
    return RecordStore(conn, definition, model(class_kebab), actor_id=actor_id)


def fetch_by_locator(
    store: RecordStore[Any],
    definition: ClassDefinition,
    locator: str,
) -> Any:
    """Resolve locator and fetch; raise 400/404 as appropriate."""
    kind, value = classify_locator(definition, locator)
    if kind == "id":
        assert isinstance(value, UUID)
        row = store.fetch_by_id(value)
    else:
        assert isinstance(value, str)
        row = store.fetch_by_friendly_id(value)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{definition.name_kebab} not found",
        )
    return row
