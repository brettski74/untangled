"""Deterministic canonical serialization of Schema IR."""

from __future__ import annotations

import json
from typing import Any

from untangled.schema.ir import CheckIR, ForeignKeyIR, IndexIR, SchemaIR, TableIR


def canonical_bytes(schema: SchemaIR) -> bytes:
    """Serialize ``schema`` to stable UTF-8 JSON bytes for hashing/compare."""
    return _encode(canonical_dict(schema))


def table_canonical_bytes(table: TableIR) -> bytes:
    """Serialize one table's IR slice with the same rules as whole-schema output."""
    return _encode(_table_dict(table))


def canonical_dict(schema: SchemaIR) -> dict[str, Any]:
    """Return a JSON-ready dict with stable ordering of tables and members."""
    tables = sorted(schema.tables, key=lambda t: t.name)
    return {"tables": [_table_dict(t) for t in tables]}


def _table_dict(table: TableIR) -> dict[str, Any]:
    columns = sorted(table.columns, key=lambda c: c.name)
    foreign_keys = sorted(
        table.foreign_keys,
        key=lambda fk: (fk.name, fk.columns, fk.referenced_table, fk.referenced_columns),
    )
    indexes = sorted(table.indexes, key=lambda idx: (idx.name, idx.columns, idx.unique))
    checks = sorted(table.checks, key=lambda chk: (chk.name, chk.expression))
    return {
        "name": table.name,
        "columns": [
            {"name": c.name, "type_name": c.type_name, "nullable": c.nullable} for c in columns
        ],
        "primary_key": list(table.primary_key),
        "foreign_keys": [_foreign_key_dict(fk) for fk in foreign_keys],
        "indexes": [_index_dict(idx) for idx in indexes],
        "checks": [_check_dict(chk) for chk in checks],
    }


def _foreign_key_dict(fk: ForeignKeyIR) -> dict[str, Any]:
    return {
        "name": fk.name,
        "columns": list(fk.columns),
        "referenced_table": fk.referenced_table,
        "referenced_columns": list(fk.referenced_columns),
    }


def _index_dict(idx: IndexIR) -> dict[str, Any]:
    return {
        "name": idx.name,
        "columns": list(idx.columns),
        "unique": idx.unique,
    }


def _check_dict(chk: CheckIR) -> dict[str, Any]:
    return {
        "name": chk.name,
        "expression": chk.expression,
    }


def _encode(payload: dict[str, Any]) -> bytes:
    # Compact separators + sorted keys → byte-stable across equivalent IR.
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")
