"""Materialize / sync PostgreSQL tables from class definitions."""

from __future__ import annotations

from pathlib import Path

from psycopg import Connection, sql

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.system_fields import SYSTEM_FIELDS
from untangled.persistence.sql_types import postgres_type


def apply_schema(conn: Connection, definitions_dir: Path) -> list[ClassDefinition]:
    """Load all definitions under ``definitions_dir`` and sync each table.

    Dev/test sync is recreate-friendly: existing tables for defined classes are
    dropped and recreated. Formal versioned migrations are a later ticket.
    """
    definitions = load_definitions(definitions_dir)
    for definition in definitions:
        sync_table(conn, definition)
    return definitions


def sync_table(conn: Connection, definition: ClassDefinition) -> None:
    """Drop and recreate the table for ``definition`` (recreate-friendly sync)."""
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
