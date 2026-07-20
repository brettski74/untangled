"""Shared helpers for domain record routers."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from psycopg import Connection
from pydantic import BaseModel

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.generate import generate_models
from untangled.mapping.naming import snake_to_pascal
from untangled.persistence.store import RecordStore
from untangled.records.locator import classify_locator


def _backend_root() -> Path:
    # …/backend/src/untangled/records → backend/
    return Path(__file__).resolve().parents[3]


def definitions_dir() -> Path:
    return _backend_root() / "class-definitions"


def _pydantic_out() -> Path:
    return _backend_root() / "src" / "untangled" / "generated"


@lru_cache(maxsize=1)
def ensure_generated_package() -> None:
    """Generate Pydantic models when missing or stale (no Create/Update variants)."""
    out = _pydantic_out()
    incident = out / "incident.py"
    if incident.is_file() and "class IncidentCreate" in incident.read_text(encoding="utf-8"):
        return
    zod_tmp = _backend_root() / ".zod-generated-tmp"
    generate_models(definitions_dir(), out, zod_tmp)


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
