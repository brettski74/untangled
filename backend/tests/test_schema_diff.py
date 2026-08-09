"""Unit tests for Schema IR diff → migration plan."""

from __future__ import annotations

from pathlib import Path

from untangled.mapping.types_snake import TEXT_STORAGE_FAMILY
from untangled.persistence.sql_types import postgres_type
from untangled.schema.diff import diff_schemas
from untangled.schema.ir import CheckIR, ColumnIR, ForeignKeyIR, SchemaIR, TableIR
from untangled.schema.plan import (
    AddCheck,
    AddColumn,
    AddForeignKey,
    AlterColumnType,
    CreateTable,
    DropCheck,
    DropColumn,
    DropColumnDefault,
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


def test_diff_required_add_with_default_emits_drop_default() -> None:
    desired = _table(
        "demo_item",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("title", "text", False),
            ColumnIR("priority", "integer", False),
        ),
    )
    current = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False)),
    )
    plan = diff_schemas(
        SchemaIR(tables=(desired,)),
        SchemaIR(tables=(current,)),
        column_add_defaults={("demo_item", "priority"): 5},
    )
    assert len(plan.ops) == 2
    assert isinstance(plan.ops[0], AddColumn)
    assert plan.ops[0].column.name == "priority"
    assert plan.ops[0].add_default == 5
    assert isinstance(plan.ops[1], DropColumnDefault)
    assert plan.ops[1].table_name == "demo_item"
    assert plan.ops[1].column_name == "priority"


def test_diff_required_add_without_default_has_no_drop_default() -> None:
    desired = _table(
        "demo_item",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("title", "text", False),
            ColumnIR("priority", "integer", False),
        ),
    )
    current = _table(
        "demo_item",
        (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False)),
    )
    plan = diff_schemas(SchemaIR(tables=(desired,)), SchemaIR(tables=(current,)))
    assert len(plan.ops) == 1
    assert isinstance(plan.ops[0], AddColumn)
    assert plan.ops[0].add_default is None


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


def test_diff_add_and_drop_check_is_not_destructive() -> None:
    base_cols = (ColumnIR("id", "uuid", False), ColumnIR("title", "text", False))
    without = TableIR(name="demo_item", columns=base_cols, primary_key=("id",))
    with_check = TableIR(
        name="demo_item",
        columns=base_cols,
        primary_key=("id",),
        checks=(CheckIR(name="demo_item_check_1", expression="quantity >= 1"),),
    )
    add_plan = diff_schemas(SchemaIR(tables=(with_check,)), SchemaIR(tables=(without,)))
    assert [type(op).__name__ for op in add_plan.ops] == ["AddCheck"]
    assert isinstance(add_plan.ops[0], AddCheck)
    assert not add_plan.destructive_ops

    drop_plan = diff_schemas(SchemaIR(tables=(without,)), SchemaIR(tables=(with_check,)))
    assert [type(op).__name__ for op in drop_plan.ops] == ["DropCheck"]
    assert isinstance(drop_plan.ops[0], DropCheck)
    assert not drop_plan.destructive_ops


def test_text_storage_family_maps_to_text() -> None:
    assert all(postgres_type(t) == "text" for t in TEXT_STORAGE_FAMILY)


def test_intra_family_text_type_rename_emits_no_alter() -> None:
    """YAML semantic renames within the text family must not emit DDL."""
    current = _table(
        "incident",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("summary", "text", False),
            ColumnIR("status", "text", False),
        ),
    )
    desired = _table(
        "incident",
        (
            ColumnIR("id", "uuid", False),
            ColumnIR("summary", "text", False),  # was string / compact_text
            ColumnIR("status", "text", False),  # was string → status
        ),
    )
    plan = diff_schemas(SchemaIR(tables=(desired,)), SchemaIR(tables=(current,)))
    assert plan.ops == ()
    assert not any(isinstance(op, AlterColumnType) for op in plan.ops)


def test_display_attribute_metadata_does_not_change_schema_hash(
    repo_definitions: Path,
) -> None:
    from dataclasses import replace

    from untangled.mapping.definition_snake import load_definitions
    from untangled.schema.from_yaml import desired_schema_from_classes
    from untangled.schema.hash import schema_hash

    definitions = load_definitions(repo_definitions)
    cleared = [replace(defn, display_attribute=None) for defn in definitions]
    assert schema_hash(desired_schema_from_classes(cleared)) == schema_hash(
        desired_schema_from_classes(definitions)
    )
    plan = diff_schemas(
        desired_schema_from_classes(definitions),
        desired_schema_from_classes(cleared),
    )
    assert plan.ops == ()


def test_string_to_text_family_retarget_preserves_schema_hash(
    repo_definitions: Path,
) -> None:
    """Whole-tree retarget from deprecated ``string`` keeps migrate Schema IR identical."""
    from dataclasses import replace

    from untangled.mapping.definition_snake import load_definitions
    from untangled.schema.from_yaml import desired_schema_from_classes
    from untangled.schema.hash import schema_hash

    definitions = load_definitions(repo_definitions)
    as_string = [
        replace(
            defn,
            attributes=tuple(
                replace(attr, type_name="string")
                if attr.type_name in TEXT_STORAGE_FAMILY
                else attr
                for attr in defn.attributes
            ),
        )
        for defn in definitions
    ]
    assert schema_hash(desired_schema_from_classes(as_string)) == schema_hash(
        desired_schema_from_classes(definitions)
    )
    plan = diff_schemas(
        desired_schema_from_classes(definitions),
        desired_schema_from_classes(as_string),
    )
    assert plan.ops == ()
