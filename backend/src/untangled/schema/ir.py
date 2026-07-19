"""Canonical Schema IR for YAML intent and Postgres catalog state."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ColumnIR:
    """One column on a table."""

    name: str
    type_name: str
    nullable: bool


@dataclass(frozen=True, slots=True)
class ForeignKeyIR:
    """Foreign key constraint (enough for a later FK demo class)."""

    name: str
    columns: tuple[str, ...]
    referenced_table: str
    referenced_columns: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class IndexIR:
    """Index extension point; not fully exercised in the IR baseline."""

    name: str
    columns: tuple[str, ...]
    unique: bool = False


@dataclass(frozen=True, slots=True)
class CheckIR:
    """Check-constraint extension point; not fully exercised in the IR baseline."""

    name: str
    expression: str


@dataclass(frozen=True, slots=True)
class TableIR:
    """One managed table (class) in the schema."""

    name: str
    columns: tuple[ColumnIR, ...]
    primary_key: tuple[str, ...]
    foreign_keys: tuple[ForeignKeyIR, ...] = ()
    indexes: tuple[IndexIR, ...] = ()
    checks: tuple[CheckIR, ...] = ()


@dataclass(frozen=True, slots=True)
class SchemaIR:
    """Whole-schema snapshot: desired (YAML) or current (introspected)."""

    tables: tuple[TableIR, ...]
