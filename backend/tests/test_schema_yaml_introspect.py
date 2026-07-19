"""YAML→IR and Postgres introspection tests for Schema IR."""

from __future__ import annotations

from pathlib import Path

from psycopg import Connection, sql

from untangled.mapping.definition import ClassDefinition
from untangled.schema import (
    ForeignKeyIR,
    desired_schema_from_definitions,
    introspect_schema,
    schema_hash,
    table_hash,
)


def test_desired_schema_from_demo_yaml(repo_definitions: Path) -> None:
    desired = desired_schema_from_definitions(repo_definitions)
    assert len(desired.tables) == 1
    table = desired.tables[0]
    assert table.name == "demo_item"
    assert table.primary_key == ("id",)
    assert table.foreign_keys == ()

    by_name = {col.name: col for col in table.columns}
    assert set(by_name) >= {
        "id",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "title",
        "summary",
        "is_active",
        "quantity",
        "unit_price",
        "fixed_amount",
        "due_at",
    }
    assert by_name["id"].type_name == "uuid" and not by_name["id"].nullable
    assert by_name["title"].type_name == "text" and not by_name["title"].nullable
    assert by_name["summary"].type_name == "text" and by_name["summary"].nullable
    assert by_name["is_active"].type_name == "boolean"
    assert by_name["quantity"].type_name == "integer"
    assert by_name["unit_price"].type_name == "double precision" and by_name["unit_price"].nullable
    assert by_name["fixed_amount"].type_name == "numeric"
    assert by_name["due_at"].type_name == "timestamptz" and by_name["due_at"].nullable


def test_introspect_matches_desired_for_demo(
    db_conn: Connection,
    demo_schema: list[ClassDefinition],
    repo_definitions: Path,
) -> None:
    assert demo_schema
    desired = desired_schema_from_definitions(repo_definitions)
    managed = [t.name for t in desired.tables]
    current = introspect_schema(db_conn, managed)

    assert schema_hash(desired) == schema_hash(current)
    assert len(desired.tables) == 1
    assert table_hash(desired.tables[0]) == table_hash(current.tables[0])

    desired_cols = {c.name: c for c in desired.tables[0].columns}
    current_cols = {c.name: c for c in current.tables[0].columns}
    assert desired_cols == current_cols
    assert current.tables[0].primary_key == ("id",)
    assert current.tables[0].foreign_keys == ()


def test_introspect_reads_foreign_keys(
    db_conn: Connection,
    demo_schema: list[ClassDefinition],
) -> None:
    assert demo_schema
    # Synthetic FK table for introspection only (YAML FK demo belongs to a later ticket).
    with db_conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS schema_ir_fk_child CASCADE")
        cur.execute(
            """
            CREATE TABLE schema_ir_fk_child (
                id uuid PRIMARY KEY,
                parent_id uuid NOT NULL,
                CONSTRAINT schema_ir_fk_child_parent_fkey
                    FOREIGN KEY (parent_id) REFERENCES demo_item (id)
            )
            """
        )
    db_conn.commit()

    try:
        current = introspect_schema(db_conn, ["schema_ir_fk_child"])
        assert len(current.tables) == 1
        table = current.tables[0]
        assert table.primary_key == ("id",)
        assert table.foreign_keys == (
            ForeignKeyIR(
                name="schema_ir_fk_child_parent_fkey",
                columns=("parent_id",),
                referenced_table="demo_item",
                referenced_columns=("id",),
            ),
        )
    finally:
        db_conn.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(
            sql.Identifier("schema_ir_fk_child")
        ))
        db_conn.commit()


def test_introspect_omits_missing_tables(db_conn: Connection) -> None:
    current = introspect_schema(db_conn, ["definitely_not_a_real_table_xyz"])
    assert current.tables == ()
