"""Build desired Schema IR from YAML class definitions + injected system fields."""

from __future__ import annotations

from pathlib import Path

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.naming import kebab_to_snake
from untangled.mapping.system_fields import SYSTEM_FIELDS
from untangled.schema.ir import ColumnIR, ForeignKeyIR, SchemaIR, TableIR
from untangled.schema.types import ir_type_from_yaml


def desired_schema_from_definitions(definitions_dir: Path) -> SchemaIR:
    """Load class definitions and return the desired Schema IR."""
    return desired_schema_from_classes(load_definitions(definitions_dir))


def desired_schema_from_classes(definitions: list[ClassDefinition]) -> SchemaIR:
    """Build desired Schema IR from already-loaded class definitions."""
    tables = tuple(_table_from_definition(defn) for defn in definitions)
    return SchemaIR(tables=tables)


def foreign_key_constraint_name(table_name: str, *columns: str) -> str:
    """Stable Postgres-style FK name: ``{table}_{col}_fkey``."""
    return f"{table_name}_{'_'.join(columns)}_fkey"


def _table_from_definition(definition: ClassDefinition) -> TableIR:
    columns: list[ColumnIR] = []
    foreign_keys: list[ForeignKeyIR] = []
    primary_key: tuple[str, ...] = ()

    for field in SYSTEM_FIELDS:
        columns.append(
            ColumnIR(
                name=field.name,
                type_name=ir_type_from_yaml(field.type_name),
                nullable=False,
            )
        )
        if field.name == "id":
            primary_key = ("id",)

    for attr in definition.attributes:
        columns.append(
            ColumnIR(
                name=attr.name_snake,
                type_name=ir_type_from_yaml(attr.type_name),
                nullable=not attr.required,
            )
        )
        if attr.references is not None:
            col = attr.name_snake
            foreign_keys.append(
                ForeignKeyIR(
                    name=foreign_key_constraint_name(definition.name_snake, col),
                    columns=(col,),
                    referenced_table=kebab_to_snake(attr.references),
                    referenced_columns=("id",),
                )
            )

    return TableIR(
        name=definition.name_snake,
        columns=tuple(columns),
        primary_key=primary_key,
        foreign_keys=tuple(foreign_keys),
        indexes=(),
        checks=(),
    )
