"""Read helpers for the system-config singleton (fail closed + clamp)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg import Connection
from pydantic import BaseModel

from untangled.mapping.definition import AttributeDefinition, ClassDefinition
from untangled.mapping.registry import class_definition
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.persistence.actor import SYSTEM_USER_ID
from untangled.persistence.store import RecordStore
from untangled.records.deps import ensure_generated_package, model


class SystemConfigUnreadableError(RuntimeError):
    """Raised when the system-config singleton cannot be read."""


def _bound_number(raw: int | float | Decimal | Any) -> int | float | Decimal:
    if isinstance(raw, Decimal):
        return raw
    if isinstance(raw, float):
        return raw
    return int(raw)


def _clamp_number(
    value: int | float | Decimal,
    attr: AttributeDefinition,
) -> int | float | Decimal:
    result: int | float | Decimal = value
    if attr.min_value is not None:
        lower = _bound_number(attr.min_value)
        if result < lower:  # type: ignore[operator]
            result = lower
    if attr.max_value is not None:
        upper = _bound_number(attr.max_value)
        if result > upper:  # type: ignore[operator]
            result = upper
    if isinstance(value, int) and not isinstance(value, bool):
        return int(result)
    if isinstance(value, float):
        return float(result)
    if isinstance(value, Decimal):
        return Decimal(result)
    return result


def clamp_system_config(row: BaseModel, definition: ClassDefinition) -> BaseModel:
    """Return a copy of ``row`` with numeric min/max attributes clamped.

    Bounds come only from ``definition`` attribute metadata — not a second
    hand-authored limit table. Supports integer, float, and decimal values.
    """
    updates: dict[str, int | float | Decimal] = {}
    for attr in definition.attributes:
        if attr.min_value is None and attr.max_value is None:
            continue
        current = getattr(row, attr.name_snake)
        if isinstance(current, bool) or not isinstance(current, (int, float, Decimal)):
            continue
        clamped = _clamp_number(current, attr)
        if clamped != current:
            updates[attr.name_snake] = clamped
    if not updates:
        return row
    return row.model_copy(update=updates)


def load_system_config(
    conn: Connection,
    *,
    row_id: UUID = SYSTEM_CONFIG_ID,
) -> BaseModel:
    """Fetch and clamp the singleton. Raises if missing or unreadable."""
    ensure_generated_package()
    definition = class_definition("system-config")
    model_cls = model("system-config")
    store: RecordStore[Any] = RecordStore(
        conn,
        definition,
        model_cls,
        actor_id=SYSTEM_USER_ID,
    )
    try:
        row = store.fetch_by_id(row_id)
    except Exception as exc:  # noqa: BLE001 — fail closed for any read failure
        raise SystemConfigUnreadableError(
            "system-config singleton could not be read"
        ) from exc
    if row is None:
        raise SystemConfigUnreadableError(
            "system-config singleton could not be read"
        )
    assert isinstance(row, BaseModel)
    return clamp_system_config(row, definition)
