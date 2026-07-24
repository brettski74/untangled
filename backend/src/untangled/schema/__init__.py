"""Schema IR, YAML/Postgres loaders, hashing, and diff-based migrate."""

from untangled.schema.diff import diff_schemas
from untangled.schema.from_yaml import (
    desired_schema_from_classes,
    desired_schema_from_definitions,
    foreign_key_constraint_name,
    unique_index_name,
)
from untangled.schema.hash import schema_hash, table_hash
from untangled.schema.introspect import introspect_schema
from untangled.schema.ir import (
    CheckIR,
    ColumnIR,
    ForeignKeyIR,
    IndexIR,
    SchemaIR,
    SequenceIR,
    TableIR,
)
from untangled.schema.migrate import DestructivePlanError, MigrateResult, migrate
from untangled.schema.plan import MigrationPlan
from untangled.schema.serialize import canonical_bytes, canonical_dict, table_canonical_bytes

__all__ = [
    "CheckIR",
    "ColumnIR",
    "DestructivePlanError",
    "ForeignKeyIR",
    "IndexIR",
    "MigrateResult",
    "MigrationPlan",
    "SchemaIR",
    "SequenceIR",
    "TableIR",
    "canonical_bytes",
    "canonical_dict",
    "desired_schema_from_classes",
    "desired_schema_from_definitions",
    "diff_schemas",
    "foreign_key_constraint_name",
    "introspect_schema",
    "migrate",
    "schema_hash",
    "table_canonical_bytes",
    "table_hash",
    "unique_index_name",
]
