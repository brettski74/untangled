"""Build desired Schema IR from YAML class definitions + injected system fields."""

from __future__ import annotations

from pathlib import Path

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.naming import kebab_to_snake
from untangled.mapping.system_fields import AUDIT_USER_TABLE, SYSTEM_FIELDS
from untangled.mapping.types import friendly_id_sequence_name
from untangled.schema.ir import ColumnIR, ForeignKeyIR, IndexIR, SchemaIR, SequenceIR, TableIR
from untangled.schema.types import ir_type_from_yaml


def desired_schema_from_definitions(definitions_dir: Path) -> SchemaIR:
    """Load class definitions and return the desired Schema IR."""
    return desired_schema_from_classes(load_definitions(definitions_dir))


def desired_schema_from_classes(definitions: list[ClassDefinition]) -> SchemaIR:
    """Build desired Schema IR from already-loaded class definitions."""
    class_names = {defn.name_snake for defn in definitions}
    include_audit_fks = AUDIT_USER_TABLE in class_names
    tables = tuple(
        _table_from_definition(defn, include_audit_fks=include_audit_fks) for defn in definitions
    )
    sequences = tuple(_sequences_from_definitions(definitions))
    return SchemaIR(tables=tables, sequences=sequences)


def foreign_key_constraint_name(table_name: str, *columns: str) -> str:
    """Stable Postgres-style FK name: ``{table}_{col}_fkey``."""
    return f"{table_name}_{'_'.join(columns)}_fkey"


def unique_index_name(table_name: str, *columns: str) -> str:
    """Stable unique-index name: ``{table}_{col}_key``."""
    return f"{table_name}_{'_'.join(columns)}_key"


def _sequences_from_definitions(definitions: list[ClassDefinition]) -> list[SequenceIR]:
    sequences: list[SequenceIR] = []
    for defn in definitions:
        attr = defn.friendly_id_attr()
        if attr is None or attr.prefix is None:
            continue
        start = attr.start_at if attr.start_at is not None else 1
        sequences.append(
            SequenceIR(
                name=friendly_id_sequence_name(attr.prefix),
                start=start,
                table_name=defn.name_snake,
                column_name=attr.name_snake,
                prefix=attr.prefix,
                resolve_start_from_data=attr.start_at is None,
            )
        )
    return sorted(sequences, key=lambda s: s.name)


def _table_from_definition(
    definition: ClassDefinition,
    *,
    include_audit_fks: bool,
) -> TableIR:
    columns: list[ColumnIR] = []
    foreign_keys: list[ForeignKeyIR] = []
    indexes: list[IndexIR] = []
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
        if include_audit_fks and field.name in {"created_by", "updated_by"}:
            foreign_keys.append(
                ForeignKeyIR(
                    name=foreign_key_constraint_name(definition.name_snake, field.name),
                    columns=(field.name,),
                    referenced_table=AUDIT_USER_TABLE,
                    referenced_columns=("id",),
                )
            )

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
        if attr.unique:
            indexes.append(
                IndexIR(
                    name=unique_index_name(definition.name_snake, attr.name_snake),
                    columns=(attr.name_snake,),
                    unique=True,
                )
            )

    return TableIR(
        name=definition.name_snake,
        columns=tuple(columns),
        primary_key=primary_key,
        foreign_keys=tuple(foreign_keys),
        indexes=tuple(indexes),
        checks=(),
    )
