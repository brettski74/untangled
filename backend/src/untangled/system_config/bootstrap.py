"""Migrate-time ensure of the system-config singleton row."""

from __future__ import annotations

from decimal import Decimal

from psycopg import Connection, sql

from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.well_known import SYSTEM_CONFIG_ID, SYSTEM_USER_ID

# Seeded attribute defaults — keep aligned with system-config.yaml create-default.
SYSTEM_CONFIG_DEFAULTS: dict[str, int | Decimal] = {
    "max_search_nesting_depth": 3,
    "max_search_nesting_length": 20,
    "max_search_total_predicates": 50,
    "max_search_total_regexp": 3,
    "system_config_cache_ttl_seconds": 900,
    "password_minimum_chars": 12,
    "password_maximum_chars": 128,
    "password_acceptable_crack_time_days": 1000,
    "password_guess_per_second": 10000,
    "password_estimate_drift_factor": Decimal("1.1"),
    "password_expiry_days": 90,
    "password_grace_days": 14,
    "login_process_time_minimum": 300,
    "login_process_time_maximum": 500,
    "login_hash_concurrency_limit": 4,
    "login_maximum_failed_count": 5,
    "login_rate_limit_per_user_threshold": 10,
    "login_rate_limit_per_user_sample_period": 300,
    "login_rate_limit_per_ip_threshold": 10,
    "login_rate_limit_per_ip_sample_period": 300,
    "login_rate_limit_l1_delay": 500,
    "login_rate_limit_l2_delay": 2000,
    "login_rate_limit_lockout_seconds": 900,
    "login_rate_limit_max_kib": 16384,
    "audit_bulk_read_window_seconds": 600,
    "audit_bulk_read_max_searches": 100,
    "session_access_ttl_seconds": 900,
    "session_refresh_ttl_seconds": 604800,
    "session_total_ttl_seconds": 2592000,
    "session_refresh_reuse_grace_seconds": 15,
    "session_refresh_reuse_window_seconds": 86400,
    "session_max_refresh_retries": 5,
    "session_refresh_cleanup_seconds": 14400,
    "session_refresh_process_time_minimum": 300,
    "session_refresh_process_time_maximum": 500,
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
