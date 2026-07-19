"""Compile migration plan ops into PostgreSQL DDL statements."""

from __future__ import annotations

from psycopg import sql

from untangled.schema.ir import ColumnIR, TableIR
from untangled.schema.plan import (
    AddColumn,
    AddForeignKey,
    AlterColumnNullability,
    AlterColumnType,
    CreateIndex,
    CreateTable,
    DropColumn,
    DropForeignKey,
    DropIndex,
    DropTable,
    MigrationOp,
)


def compile_op(op: MigrationOp) -> sql.Composed:
    """Return a single DDL statement for ``op``."""
    if isinstance(op, CreateTable):
        return _create_table(op.table)
    if isinstance(op, DropTable):
        return sql.SQL("DROP TABLE {} CASCADE").format(sql.Identifier(op.table_name))
    if isinstance(op, AddColumn):
        return sql.SQL("ALTER TABLE {} ADD COLUMN {}").format(
            sql.Identifier(op.table_name),
            _column_def(op.column),
        )
    if isinstance(op, DropColumn):
        return sql.SQL("ALTER TABLE {} DROP COLUMN {}").format(
            sql.Identifier(op.table_name),
            sql.Identifier(op.column_name),
        )
    if isinstance(op, AlterColumnType):
        return sql.SQL("ALTER TABLE {} ALTER COLUMN {} TYPE {} USING {}::{}").format(
            sql.Identifier(op.table_name),
            sql.Identifier(op.column_name),
            sql.SQL(op.to_type),
            sql.Identifier(op.column_name),
            sql.SQL(op.to_type),
        )
    if isinstance(op, AlterColumnNullability):
        action = sql.SQL("DROP NOT NULL") if op.nullable else sql.SQL("SET NOT NULL")
        return sql.SQL("ALTER TABLE {} ALTER COLUMN {} {}").format(
            sql.Identifier(op.table_name),
            sql.Identifier(op.column_name),
            action,
        )
    if isinstance(op, AddForeignKey):
        fk = op.foreign_key
        return sql.SQL(
            "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})"
        ).format(
            sql.Identifier(op.table_name),
            sql.Identifier(fk.name),
            sql.SQL(", ").join(sql.Identifier(c) for c in fk.columns),
            sql.Identifier(fk.referenced_table),
            sql.SQL(", ").join(sql.Identifier(c) for c in fk.referenced_columns),
        )
    if isinstance(op, DropForeignKey):
        return sql.SQL("ALTER TABLE {} DROP CONSTRAINT {}").format(
            sql.Identifier(op.table_name),
            sql.Identifier(op.constraint_name),
        )
    if isinstance(op, CreateIndex):
        idx = op.index
        cols = sql.SQL(", ").join(sql.Identifier(c) for c in idx.columns)
        if idx.unique:
            return sql.SQL("CREATE UNIQUE INDEX {} ON {} ({})").format(
                sql.Identifier(idx.name),
                sql.Identifier(op.table_name),
                cols,
            )
        return sql.SQL("CREATE INDEX {} ON {} ({})").format(
            sql.Identifier(idx.name),
            sql.Identifier(op.table_name),
            cols,
        )
    if isinstance(op, DropIndex):
        return sql.SQL("DROP INDEX {}").format(sql.Identifier(op.index_name))
    raise TypeError(f"unsupported migration op: {type(op)!r}")


def _create_table(table: TableIR) -> sql.Composed:
    columns: list[sql.Composable] = []
    for col in table.columns:
        if table.primary_key == (col.name,):
            columns.append(
                sql.SQL("{} {} PRIMARY KEY").format(
                    sql.Identifier(col.name),
                    sql.SQL(col.type_name),
                )
            )
        else:
            columns.append(_column_def(col))
    return sql.SQL("CREATE TABLE {} ({})").format(
        sql.Identifier(table.name),
        sql.SQL(", ").join(columns),
    )


def _column_def(column: ColumnIR) -> sql.Composed:
    nullability = sql.SQL("NULL") if column.nullable else sql.SQL("NOT NULL")
    return sql.SQL("{} {} {}").format(
        sql.Identifier(column.name),
        sql.SQL(column.type_name),
        nullability,
    )
