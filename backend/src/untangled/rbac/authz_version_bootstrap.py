"""Migrate-time ensure of the authz_version singleton row."""

from __future__ import annotations

from psycopg import Connection, sql

from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.well_known import AUTHZ_VERSION_ID, SYSTEM_USER_ID

_TABLE = "authz_version"
_COLUMNS = (
    "id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "version",
)


def _relation_exists(conn: Connection, name: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (name,),
    ).fetchone()
    return row is not None


def ensure_authz_version_row(conn: Connection) -> None:
    """Insert version=1 if missing. Does not commit or overwrite an existing row."""
    if not _relation_exists(conn, _TABLE):
        return

    now = utc_now()
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT (id) DO NOTHING"
            ).format(
                sql.Identifier(_TABLE),
                sql.SQL(", ").join(sql.Identifier(c) for c in _COLUMNS),
                sql.SQL(", ").join(sql.Placeholder() for _ in _COLUMNS),
            ),
            (
                AUTHZ_VERSION_ID,
                now,
                now,
                SYSTEM_USER_ID,
                SYSTEM_USER_ID,
                1,
            ),
        )
