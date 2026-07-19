"""Normalize PostgreSQL / YAML type names into the Schema IR type vocabulary."""

from __future__ import annotations

from untangled.persistence.sql_types import YAML_TO_POSTGRES, postgres_type

# information_schema / pg_catalog names → IR type_name (matches YAML_TO_POSTGRES values).
_PG_TO_IR: dict[str, str] = {
    "text": "text",
    "boolean": "boolean",
    "bool": "boolean",
    "integer": "integer",
    "int4": "integer",
    "double precision": "double precision",
    "float8": "double precision",
    "numeric": "numeric",
    "uuid": "uuid",
    "timestamptz": "timestamptz",
    "timestamp with time zone": "timestamptz",
}


def ir_type_from_yaml(type_name: str) -> str:
    """Map a class-definition YAML type to the IR Postgres type name."""
    return postgres_type(type_name)


def ir_type_from_postgres(*, data_type: str, udt_name: str) -> str:
    """Normalize catalog type names into the IR vocabulary.

    Prefers ``udt_name`` when it is a known alias (e.g. ``timestamptz``, ``int4``),
    otherwise falls back to ``data_type``.
    """
    for candidate in (udt_name, data_type):
        key = candidate.strip().lower()
        if key in _PG_TO_IR:
            return _PG_TO_IR[key]
    raise ValueError(
        f"unsupported Postgres type for Schema IR: data_type={data_type!r} udt_name={udt_name!r}"
    )


assert set(YAML_TO_POSTGRES.values()) <= set(_PG_TO_IR.values())
