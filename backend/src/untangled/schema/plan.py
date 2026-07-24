"""Structured migration plan operations."""

from __future__ import annotations

from dataclasses import dataclass

from untangled.schema.ir import ColumnIR, ForeignKeyIR, IndexIR, SequenceIR, TableIR


@dataclass(frozen=True, slots=True)
class CreateTable:
    """Create a managed table (columns + primary key; FKs are separate ops)."""

    table: TableIR

    @property
    def destructive(self) -> bool:
        return False

    def describe(self) -> str:
        return f"CREATE TABLE {self.table.name}"


@dataclass(frozen=True, slots=True)
class DropTable:
    """Drop a managed table."""

    table_name: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return f"DROP TABLE {self.table_name}"


@dataclass(frozen=True, slots=True)
class AddColumn:
    """Add a column to an existing table."""

    table_name: str
    column: ColumnIR

    @property
    def destructive(self) -> bool:
        return False

    def describe(self) -> str:
        null = "NULL" if self.column.nullable else "NOT NULL"
        return f"ADD COLUMN {self.table_name}.{self.column.name} {self.column.type_name} {null}"


@dataclass(frozen=True, slots=True)
class DropColumn:
    """Drop a column from an existing table."""

    table_name: str
    column_name: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return f"DROP COLUMN {self.table_name}.{self.column_name}"


@dataclass(frozen=True, slots=True)
class AlterColumnType:
    """Change a column's type (treated as destructive for the safety gate)."""

    table_name: str
    column_name: str
    from_type: str
    to_type: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return (
            f"ALTER COLUMN {self.table_name}.{self.column_name} "
            f"TYPE {self.from_type} → {self.to_type}"
        )


@dataclass(frozen=True, slots=True)
class AlterColumnNullability:
    """Change column nullability."""

    table_name: str
    column_name: str
    nullable: bool

    @property
    def destructive(self) -> bool:
        # Tightening nullability can fail on existing NULLs / lose write freedom.
        return not self.nullable

    def describe(self) -> str:
        null = "NULL" if self.nullable else "NOT NULL"
        return f"ALTER COLUMN {self.table_name}.{self.column_name} SET {null}"


@dataclass(frozen=True, slots=True)
class AddForeignKey:
    """Add a foreign-key constraint."""

    table_name: str
    foreign_key: ForeignKeyIR

    @property
    def destructive(self) -> bool:
        return False

    def describe(self) -> str:
        cols = ", ".join(self.foreign_key.columns)
        refs = ", ".join(self.foreign_key.referenced_columns)
        return (
            f"ADD FOREIGN KEY {self.foreign_key.name} on {self.table_name} "
            f"({cols}) → {self.foreign_key.referenced_table} ({refs})"
        )


@dataclass(frozen=True, slots=True)
class DropForeignKey:
    """Drop a foreign-key constraint."""

    table_name: str
    constraint_name: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return f"DROP FOREIGN KEY {self.table_name}.{self.constraint_name}"


@dataclass(frozen=True, slots=True)
class CreateIndex:
    """Create an index (unique or non-unique) on a managed table."""

    table_name: str
    index: IndexIR

    @property
    def destructive(self) -> bool:
        return False

    def describe(self) -> str:
        kind = "UNIQUE INDEX" if self.index.unique else "INDEX"
        cols = ", ".join(self.index.columns)
        return f"CREATE {kind} {self.index.name} on {self.table_name} ({cols})"


@dataclass(frozen=True, slots=True)
class DropIndex:
    """Drop an index from a managed table."""

    index_name: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return f"DROP INDEX {self.index_name}"


@dataclass(frozen=True, slots=True)
class CreateSequence:
    """Create a PostgreSQL sequence (friendly-id allocation)."""

    sequence: SequenceIR

    @property
    def destructive(self) -> bool:
        return False

    def describe(self) -> str:
        return f"CREATE SEQUENCE {self.sequence.name} START {self.sequence.start}"


@dataclass(frozen=True, slots=True)
class DropSequence:
    """Drop a managed sequence."""

    sequence_name: str

    @property
    def destructive(self) -> bool:
        return True

    def describe(self) -> str:
        return f"DROP SEQUENCE {self.sequence_name}"


MigrationOp = (
    CreateTable
    | DropTable
    | AddColumn
    | DropColumn
    | AlterColumnType
    | AlterColumnNullability
    | AddForeignKey
    | DropForeignKey
    | CreateIndex
    | DropIndex
    | CreateSequence
    | DropSequence
)


@dataclass(frozen=True, slots=True)
class MigrationPlan:
    """Ordered list of schema operations to reconcile current → desired."""

    ops: tuple[MigrationOp, ...]

    @property
    def destructive_ops(self) -> tuple[MigrationOp, ...]:
        return tuple(op for op in self.ops if op.destructive)

    @property
    def is_empty(self) -> bool:
        return not self.ops
