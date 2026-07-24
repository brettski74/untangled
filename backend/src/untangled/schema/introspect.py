"""Load current Schema IR from PostgreSQL catalog introspection."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence

from psycopg import Connection

from untangled.schema.ir import ColumnIR, ForeignKeyIR, IndexIR, SchemaIR, SequenceIR, TableIR
from untangled.schema.types import ir_type_from_postgres


def introspect_schema(
    conn: Connection,
    table_names: Sequence[str],
    *,
    schema_name: str = "public",
    sequence_names: Sequence[str] | None = None,
) -> SchemaIR:
    """Introspect ``table_names`` (and optional sequences) into a Schema IR snapshot.

    Only the listed tables are included (managed classes). Missing tables are
    omitted so callers can treat absence as empty current state for that name.
    When ``sequence_names`` is provided, only those sequences are considered;
    missing names are omitted.
    """
    names = tuple(dict.fromkeys(table_names))  # stable unique order
    tables: list[TableIR] = []
    if names:
        existing = _existing_tables(conn, schema_name, names)
        for name in names:
            if name not in existing:
                continue
            tables.append(_introspect_table(conn, schema_name, name))

    sequences: tuple[SequenceIR, ...] = ()
    if sequence_names is not None:
        sequences = tuple(
            _introspect_sequences(conn, schema_name, tuple(dict.fromkeys(sequence_names)))
        )
    return SchemaIR(tables=tuple(tables), sequences=sequences)


def _existing_tables(conn: Connection, schema_name: str, names: Sequence[str]) -> set[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type = 'BASE TABLE'
          AND table_name = ANY(%s)
        """,
        (schema_name, list(names)),
    ).fetchall()
    return {row[0] for row in rows}


def _introspect_table(conn: Connection, schema_name: str, table_name: str) -> TableIR:
    columns = tuple(_introspect_columns(conn, schema_name, table_name))
    primary_key = tuple(_introspect_primary_key(conn, schema_name, table_name))
    foreign_keys = tuple(_introspect_foreign_keys(conn, schema_name, table_name))
    indexes = tuple(_introspect_indexes(conn, schema_name, table_name))
    return TableIR(
        name=table_name,
        columns=columns,
        primary_key=primary_key,
        foreign_keys=foreign_keys,
        indexes=indexes,
        checks=(),
    )


def _introspect_columns(
    conn: Connection, schema_name: str, table_name: str
) -> Iterable[ColumnIR]:
    rows = conn.execute(
        """
        SELECT column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema_name, table_name),
    ).fetchall()
    for column_name, data_type, udt_name, is_nullable in rows:
        yield ColumnIR(
            name=column_name,
            type_name=ir_type_from_postgres(data_type=data_type, udt_name=udt_name),
            nullable=is_nullable == "YES",
        )


def _introspect_primary_key(
    conn: Connection, schema_name: str, table_name: str
) -> Iterable[str]:
    rows = conn.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = %s
          AND tc.table_name = %s
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
        """,
        (schema_name, table_name),
    ).fetchall()
    for (column_name,) in rows:
        yield column_name


def _introspect_foreign_keys(
    conn: Connection, schema_name: str, table_name: str
) -> Iterable[ForeignKeyIR]:
    rows = conn.execute(
        """
        SELECT
            con.conname AS constraint_name,
            att.attname AS column_name,
            ref_cl.relname AS referenced_table,
            ref_att.attname AS referenced_column,
            ord.ordinality AS position
        FROM pg_constraint AS con
        JOIN pg_class AS cl ON cl.oid = con.conrelid
        JOIN pg_namespace AS ns ON ns.oid = cl.relnamespace
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(attnum, ordinality) ON TRUE
        JOIN pg_attribute AS att
          ON att.attrelid = con.conrelid AND att.attnum = ord.attnum
        JOIN pg_class AS ref_cl ON ref_cl.oid = con.confrelid
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS ref_ord(attnum, ordinality)
          ON ref_ord.ordinality = ord.ordinality
        JOIN pg_attribute AS ref_att
          ON ref_att.attrelid = con.confrelid AND ref_att.attnum = ref_ord.attnum
        WHERE con.contype = 'f'
          AND ns.nspname = %s
          AND cl.relname = %s
        ORDER BY con.conname, ord.ordinality
        """,
        (schema_name, table_name),
    ).fetchall()

    grouped: dict[str, list[tuple[int, str, str, str]]] = defaultdict(list)
    for constraint_name, column_name, referenced_table, referenced_column, position in rows:
        grouped[constraint_name].append(
            (position, column_name, referenced_table, referenced_column)
        )

    for constraint_name in sorted(grouped):
        parts = sorted(grouped[constraint_name], key=lambda item: item[0])
        yield ForeignKeyIR(
            name=constraint_name,
            columns=tuple(p[1] for p in parts),
            referenced_table=parts[0][2],
            referenced_columns=tuple(p[3] for p in parts),
        )


def _introspect_indexes(
    conn: Connection, schema_name: str, table_name: str
) -> Iterable[IndexIR]:
    """Load non-primary indexes. Unique indexes map to YAML ``unique: true``."""
    rows = conn.execute(
        """
        SELECT
            i.relname AS index_name,
            ix.indisunique AS is_unique,
            a.attname AS column_name,
            x.ordinality AS position
        FROM pg_index AS ix
        JOIN pg_class AS t ON t.oid = ix.indrelid
        JOIN pg_namespace AS ns ON ns.oid = t.relnamespace
        JOIN pg_class AS i ON i.oid = ix.indexrelid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON TRUE
        JOIN pg_attribute AS a
          ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE ns.nspname = %s
          AND t.relname = %s
          AND NOT ix.indisprimary
          AND x.attnum > 0
        ORDER BY i.relname, x.ordinality
        """,
        (schema_name, table_name),
    ).fetchall()

    grouped: dict[str, list[tuple[int, str, bool]]] = defaultdict(list)
    for index_name, is_unique, column_name, position in rows:
        grouped[index_name].append((position, column_name, bool(is_unique)))

    for index_name in sorted(grouped):
        parts = sorted(grouped[index_name], key=lambda item: item[0])
        yield IndexIR(
            name=index_name,
            columns=tuple(p[1] for p in parts),
            unique=parts[0][2],
        )


def _introspect_sequences(
    conn: Connection,
    schema_name: str,
    sequence_names: Sequence[str],
) -> Iterable[SequenceIR]:
    """Load managed sequences by name. ``start`` is the catalog start value."""
    if not sequence_names:
        return
    rows = conn.execute(
        """
        SELECT sequencename, start_value
        FROM pg_catalog.pg_sequences
        WHERE schemaname = %s
          AND sequencename = ANY(%s)
        ORDER BY sequencename
        """,
        (schema_name, list(sequence_names)),
    ).fetchall()
    for sequencename, start_value in rows:
        yield SequenceIR(name=sequencename, start=int(start_value))
