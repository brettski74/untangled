"""Materialize / sync PostgreSQL tables from class definitions.

Shared operational path is :func:`untangled.schema.migrate.migrate`. The helpers
here remain as thin wrappers / non-authoritative reset utilities.
"""

from __future__ import annotations

from pathlib import Path

from psycopg import Connection, sql

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELDS
from untangled.persistence.sql_types import postgres_type


def apply_schema(
    conn: Connection,
    definitions_dir: Path,
    *,
    allow_destructive: bool = True,
) -> list[ClassDefinition]:
    """Reconcile DB to definitions via diff-based ``migrate()``.

    Defaults to ``allow_destructive=True`` so callers that previously relied on
    drop/recreate can still reach the desired schema. Prefer calling ``migrate``
    directly when the destructive gate matters.
    """
    # Lazy import: persistence ↔ schema would otherwise cycle at package import time.
    from untangled.schema.migrate import migrate

    result = migrate(conn, definitions_dir, allow_destructive=allow_destructive)
    return list(result.definitions)


def sync_table(conn: Connection, definition: ClassDefinition) -> None:
    """Non-authoritative reset: drop and recreate one table (tests / emergency).

    Prefer ``migrate()`` for shared schema evolution. This helper does not
    update version history or create restore points.
    """
    table = sql.Identifier(definition.name_snake)
    columns: list[sql.Composable] = []

    for field in SYSTEM_FIELDS:
        col_type = postgres_type(field.type_name)
        if field.name == "id":
            columns.append(
                sql.SQL("{} {} PRIMARY KEY").format(sql.Identifier(field.name), sql.SQL(col_type))
            )
        else:
            columns.append(
                sql.SQL("{} {} NOT NULL").format(sql.Identifier(field.name), sql.SQL(col_type))
            )

    for attr in definition.attributes:
        col_type = postgres_type(attr.type_name)
        nullability = sql.SQL("NOT NULL") if attr.required else sql.SQL("NULL")
        columns.append(
            sql.SQL("{} {} {}").format(
                sql.Identifier(attr.name_snake),
                sql.SQL(col_type),
                nullability,
            )
        )

    with conn.cursor() as cur:
        cur.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(table))
        cur.execute(
            sql.SQL("CREATE TABLE {} ({})").format(table, sql.SQL(", ").join(columns))
        )
    conn.commit()
