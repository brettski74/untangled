"""Shared helpers for domain record routers."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from psycopg import Connection
from pydantic import BaseModel

import untangled
from untangled.mapping import registry as class_registry
from untangled.mapping.definition import ClassDefinition
from untangled.mapping.generate_snake import generate_models_snake as generate_models
from untangled.mapping.naming import snake_to_pascal
from untangled.persistence.store import RecordStore
from untangled.records.locator import classify_locator

DEFINITIONS_DIR_ENV = class_registry.DEFINITIONS_DIR_ENV


def _source_tree_definitions(*, records_file: Path | None = None) -> Path | None:
    """Return class-definitions when running from ``backend/src/untangled/…``."""
    return class_registry._source_tree_definitions(start_file=records_file)


def resolve_definitions_dir(
    *,
    records_file: Path | None = None,
    cwd: Path | None = None,
    environ: dict[str, str] | None = None,
) -> Path:
    """Locate YAML class-definitions for runtime (src tree, Compose ``/app``, or env)."""
    return class_registry.resolve_definitions_dir(
        records_file=records_file,
        cwd=cwd,
        environ=environ,
    )


def definitions_dir() -> Path:
    """Return the class-definitions directory used by record routers and seeds."""
    return class_registry.definitions_dir()


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


class _DefinitionsByKebab:
    """Callable cache proxy so tests can ``cache_clear`` the shared registry."""

    def __call__(self) -> dict[str, ClassDefinition]:
        return class_registry.definitions_by_kebab()

    def cache_clear(self) -> None:
        class_registry.clear_definition_caches()


_definitions_by_kebab = _DefinitionsByKebab()


def class_definition(class_kebab: str) -> ClassDefinition:
    """Return the loaded class definition for ``class_kebab``."""
    return class_registry.class_definition(class_kebab)


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
    return RecordStore(
        conn,
        definition,
        model(class_kebab),
        actor_id=actor_id,
        definitions_by_kebab=_definitions_by_kebab(),
    )


def fetch_by_locator(
    store: RecordStore[Any],
    definition: ClassDefinition,
    locator: str,
    *,
    enrich_fk_identity: bool = False,
) -> Any:
    """Resolve locator and fetch; raise 422/404 as appropriate."""
    kind, value = classify_locator(definition, locator)
    if kind == "id":
        assert isinstance(value, UUID)
        row = store.fetch_by_id(value, enrich_fk_identity=enrich_fk_identity)
    else:
        assert isinstance(value, str)
        row = store.fetch_by_friendly_id(value, enrich_fk_identity=enrich_fk_identity)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{definition.name_kebab} not found",
        )
    return row
