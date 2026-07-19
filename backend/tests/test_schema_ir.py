"""Unit tests for Schema IR serialization and SHA-256 stability."""

from __future__ import annotations

from untangled.schema import (
    ColumnIR,
    ForeignKeyIR,
    SchemaIR,
    TableIR,
    canonical_bytes,
    schema_hash,
    table_hash,
)


def _sample_schema(*, title_nullable: bool = False) -> SchemaIR:
    return SchemaIR(
        tables=(
            TableIR(
                name="demo_item",
                columns=(
                    ColumnIR("id", "uuid", False),
                    ColumnIR("title", "text", title_nullable),
                    ColumnIR("created_at", "timestamptz", False),
                ),
                primary_key=("id",),
                foreign_keys=(),
            ),
        )
    )


def test_canonical_bytes_stable_for_equivalent_ir() -> None:
    left = _sample_schema()
    # Different construction order of columns must not change serialization.
    right = SchemaIR(
        tables=(
            TableIR(
                name="demo_item",
                columns=(
                    ColumnIR("title", "text", False),
                    ColumnIR("created_at", "timestamptz", False),
                    ColumnIR("id", "uuid", False),
                ),
                primary_key=("id",),
            ),
        )
    )
    assert canonical_bytes(left) == canonical_bytes(right)
    assert schema_hash(left) == schema_hash(right)


def test_schema_hash_differs_when_ir_differs() -> None:
    base = _sample_schema()
    changed = _sample_schema(title_nullable=True)
    assert schema_hash(base) != schema_hash(changed)


def test_table_hash_stable_and_sensitive() -> None:
    base = _sample_schema().tables[0]
    same = TableIR(
        name="demo_item",
        columns=(
            ColumnIR("created_at", "timestamptz", False),
            ColumnIR("id", "uuid", False),
            ColumnIR("title", "text", False),
        ),
        primary_key=("id",),
    )
    different = TableIR(
        name="demo_item",
        columns=base.columns,
        primary_key=("id",),
        foreign_keys=(
            ForeignKeyIR(
                name="demo_item_owner_fk",
                columns=("owner_id",),
                referenced_table="person",
                referenced_columns=("id",),
            ),
        ),
    )
    assert table_hash(base) == table_hash(same)
    assert table_hash(base) != table_hash(different)


def test_ir_can_represent_foreign_keys() -> None:
    schema = SchemaIR(
        tables=(
            TableIR(
                name="child_item",
                columns=(
                    ColumnIR("id", "uuid", False),
                    ColumnIR("parent_id", "uuid", False),
                ),
                primary_key=("id",),
                foreign_keys=(
                    ForeignKeyIR(
                        name="child_item_parent_id_fkey",
                        columns=("parent_id",),
                        referenced_table="demo_item",
                        referenced_columns=("id",),
                    ),
                ),
            ),
            TableIR(
                name="demo_item",
                columns=(ColumnIR("id", "uuid", False),),
                primary_key=("id",),
            ),
        )
    )
    assert len(schema.tables) == 2
    child = next(t for t in schema.tables if t.name == "child_item")
    assert child.foreign_keys[0].referenced_table == "demo_item"
    # Whole-schema hash is deterministic with multiple tables.
    assert schema_hash(schema) == schema_hash(schema)
