"""Migrate-time ensure of the system-config singleton row."""

from __future__ import annotations

from psycopg import Connection, sql

from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.well_known import SYSTEM_CONFIG_ID, SYSTEM_USER_ID

# Seeded attribute defaults — keep aligned with system-config.yaml create-default.
SYSTEM_CONFIG_DEFAULTS: dict[str, int] = {
    "max_search_nesting_depth": 3,
    "max_search_nesting_length": 20,
    "max_search_total_predicates": 50,
    "max_search_total_regexp": 3,
    "system_config_cache_ttl_seconds": 900,
}

_TABLE = "system_config"
_COLUMNS = (
    "id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    *SYSTEM_CONFIG_DEFAULTS.keys(),
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


def ensure_system_config_row(conn: Connection) -> None:
    """Insert the singleton row if missing. Does not commit or overwrite.

    No-op when ``system_config`` is absent. Attributes use
    ``SYSTEM_CONFIG_DEFAULTS``; audit columns use ``SYSTEM_USER_ID``.
    """
    if not _relation_exists(conn, _TABLE):
        return

    now = utc_now()
    values = (
        SYSTEM_CONFIG_ID,
        now,
        now,
        SYSTEM_USER_ID,
        SYSTEM_USER_ID,
        *SYSTEM_CONFIG_DEFAULTS.values(),
    )
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT (id) DO NOTHING"
            ).format(
                sql.Identifier(_TABLE),
                sql.SQL(", ").join(sql.Identifier(c) for c in _COLUMNS),
                sql.SQL(", ").join(sql.Placeholder() for _ in _COLUMNS),
            ),
            values,
        )
