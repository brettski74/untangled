"""Unit tests for Schema IR diff → migration plan."""

from __future__ import annotations

from untangled.schema.diff import diff_schemas
from untangled.schema.ir import ColumnIR, ForeignKeyIR, SchemaIR, TableIR
from untangled.schema.plan import (
    AddColumn,
    AddForeignKey,
    CreateTable,
    DropColumn,
    DropForeignKey,
    DropTable,
)


def _table(
    name: str,
    columns: tuple[ColumnIR, ...],
    *,
    fks: tuple[ForeignKeyIR, ...] = (),
) -> TableIR:
    return TableIR(
        name=name,
        columns=columns,
        primary_key=("id",),
        foreign_keys=fks,
    )


def test_diff_empty_to_desired_creates_tables_and_fk() -> None:
    parent = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False)),
    )
    child = _table(
        "demo_link",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("demo_item_id", "uuid", False),
        ),
        fks=(
            ForeignKeyIR(
                name="demo_link_demo_item_id_fkey",
                columns=("demo_item_id",),
                referenced_table="demo_item",
                referenced_columns=("id",),
            ),
        ),
    )
    plan = diff_schemas(SchemaIR(tables=(parent, child)), SchemaIR(tables=()))
    kinds = [type(op).__name__ for op in plan.ops]
    assert kinds == ["CreateTable", "CreateTable", "AddForeignKey"]
    assert isinstance(plan.ops[0], CreateTable)
    assert plan.ops[0].table.name == "demo_item"
    assert isinstance(plan.ops[1], CreateTable)
    assert plan.ops[1].table.name == "demo_link"
    assert isinstance(plan.ops[2], AddForeignKey)
    assert not plan.destructive_ops


def test_diff_extra_column_is_destructive_drop() -> None:
    desired = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False)),
    )
    current = _table(
        "demo_item",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("title", "text", False),
            ColumnIR("legacy", "text", True),
        ),
    )
    plan = diff_schemas(SchemaIR(tables=(desired,)), SchemaIR(tables=(current,)))
    assert len(plan.ops) == 1
    assert isinstance(plan.ops[0], DropColumn)
    assert plan.ops[0].column_name == "legacy"
    assert plan.destructive_ops == plan.ops


def test_diff_missing_column_is_add() -> None:
    desired = _table(
        "demo_item",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("title", "text", False),
            ColumnIR("summary", "text", True),
        ),
    )
    current = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False)),
    )
    plan = diff_schemas(SchemaIR(tables=(desired,)), SchemaIR(tables=(current,)))
    assert len(plan.ops) == 1
    assert isinstance(plan.ops[0], AddColumn)
    assert plan.ops[0].column.name == "summary"
    assert not plan.destructive_ops


def test_diff_drop_table_drops_fk_first() -> None:
    parent = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False),),
    )
    child = _table(
        "demo_link",
        (ColumnIR("id", "uuid", False), ColumnIR("demo_item_id", "uuid", False)),
        fks=(
            ForeignKeyIR(
                name="demo_link_demo_item_id_fkey",
                columns=("demo_item_id",),
                referenced_table="demo_item",
                referenced_columns=("id",),
            ),
        ),
    )
    plan = diff_schemas(SchemaIR(tables=(parent,)), SchemaIR(tables=(parent, child)))
    assert isinstance(plan.ops[0], DropForeignKey)
    assert isinstance(plan.ops[1], DropTable)
    assert plan.ops[1].table_name == "demo_link"
