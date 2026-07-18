"""Injected identity and audit fields present on every persisted class."""

from __future__ import annotations

from dataclasses import dataclass

# Snake_case names used in SQL / JSON / Python / JS / generated models.
SYSTEM_FIELD_NAMES: frozenset[str] = frozenset(
    {
        "id",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
    }
)


@dataclass(frozen=True, slots=True)
class SystemField:
    """One injected system attribute (not declared in class YAML)."""

    name: str
    type_name: str
    description: str


SYSTEM_FIELDS: tuple[SystemField, ...] = (
    SystemField("id", "uuid", "Primary key (UUIDv7)"),
    SystemField("created_at", "datetime", "Created time (UTC)"),
    SystemField("updated_at", "datetime", "Last updated time (UTC)"),
    SystemField("created_by", "uuid", "Creating user id (no FK yet)"),
    SystemField("updated_by", "uuid", "Last updating user id (no FK yet)"),
)
