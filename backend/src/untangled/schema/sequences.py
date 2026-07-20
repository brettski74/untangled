"""Resolve friendly-id sequence start values against live table data."""

from __future__ import annotations

from psycopg import Connection, sql

from untangled.schema.ir import SchemaIR, SequenceIR


def resolve_sequence_starts(conn: Connection, desired: SchemaIR) -> SchemaIR:
    """Return ``desired`` with sequence starts resolved for create-time max+1.

    Sequences with ``resolve_start_from_data`` scan matching prefix values in the
    live column; missing tables/columns yield start 1. Explicit ``start-at``
    sequences are left unchanged. Call before ``diff_schemas`` so CreateSequence
    ops carry the concrete start.
    """
    resolved: list[SequenceIR] = []
    for seq in desired.sequences:
        if not seq.resolve_start_from_data:
            resolved.append(seq)
            continue
        start = _max_numeric_plus_one(
            conn,
            table_name=seq.table_name,
            column_name=seq.column_name,
            prefix=seq.prefix,
        )
        resolved.append(
            SequenceIR(
                name=seq.name,
                start=start,
                table_name=seq.table_name,
                column_name=seq.column_name,
                prefix=seq.prefix,
                resolve_start_from_data=False,
            )
        )
    return SchemaIR(tables=desired.tables, sequences=tuple(resolved))


def _max_numeric_plus_one(
    conn: Connection,
    *,
    table_name: str,
    column_name: str,
    prefix: str,
) -> int:
    if not table_name or not column_name or not prefix:
        return 1
    exists = conn.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
          AND column_name = %s
        """,
        (table_name, column_name),
    ).fetchone()
    if exists is None:
        return 1

    # Match values that start with the prefix and whose remainder is all digits.
    pattern = f"^{prefix}[0-9]+$"
    prefix_len = len(prefix)
    row = conn.execute(
        sql.SQL(
            """
            SELECT MAX(CAST(substring({col} FROM %s) AS bigint))
            FROM {table}
            WHERE {col} ~ %s
            """
        ).format(
            table=sql.Identifier(table_name),
            col=sql.Identifier(column_name),
        ),
        (prefix_len + 1, pattern),
    ).fetchone()
    if row is None or row[0] is None:
        return 1
    return int(row[0]) + 1
