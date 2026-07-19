"""Bootstrap schema version tables and version history recording.

These management tables are intentional exceptions to YAML class definitions.
"""

from __future__ import annotations

from collections.abc import Sequence

from psycopg import Connection

from untangled.persistence.ids import new_uuid7
from untangled.schema.hash import schema_hash, table_hash
from untangled.schema.ir import SchemaIR

# WAL restore-point names: untangled_schema_v{monotonic_id} (≤63 chars).
RESTORE_POINT_PREFIX = "untangled_schema_v"

SCHEMA_VERSIONS_DDL = """
CREATE TABLE IF NOT EXISTS schema_versions (
    id bigint PRIMARY KEY,
    schema_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    superseded_at timestamptz NULL,
    restore_point_name text NULL
)
"""

SCHEMA_VERSION_CLASS_HASHES_DDL = """
CREATE TABLE IF NOT EXISTS schema_version_class_hashes (
    id uuid PRIMARY KEY,
    schema_version_id bigint NOT NULL REFERENCES schema_versions (id),
    class_name text NOT NULL,
    class_hash text NOT NULL,
    UNIQUE (schema_version_id, class_name)
)
"""


def ensure_bootstrap_tables(conn: Connection) -> None:
    """Create version-history tables if missing (non-YAML bootstrap DDL)."""
    conn.execute(SCHEMA_VERSIONS_DDL)
    conn.execute(SCHEMA_VERSION_CLASS_HASHES_DDL)


def next_schema_version_id(conn: Connection) -> int:
    """Return the next monotonic schema version id."""
    row = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM schema_versions").fetchone()
    assert row is not None
    return int(row[0])


def restore_point_name_for(version_id: int) -> str:
    """Documented naming: prefix + upcoming monotonic version id."""
    return f"{RESTORE_POINT_PREFIX}{version_id}"


def create_restore_point(conn: Connection, name: str) -> None:
    """Create a named Postgres restore point (WAL marker for PITR).

    Requires a role permitted to call ``pg_create_restore_point`` (superuser
    or equivalent). Local compose ``untangled`` is a superuser; production
    roles may need an explicit grant. PITR recovery still needs base backups
    + WAL archiving — the marker alone is not a backup.
    """
    conn.execute("SELECT pg_create_restore_point(%s)", (name,))


def record_schema_version(
    conn: Connection,
    *,
    version_id: int,
    desired: SchemaIR,
    restore_point_name: str,
) -> None:
    """Supersede the current version row and insert the new version + class hashes."""
    conn.execute(
        """
        UPDATE schema_versions
        SET superseded_at = now()
        WHERE superseded_at IS NULL
        """
    )
    whole_hash = schema_hash(desired)
    conn.execute(
        """
        INSERT INTO schema_versions (id, schema_hash, restore_point_name)
        VALUES (%s, %s, %s)
        """,
        (version_id, whole_hash, restore_point_name),
    )
    for table in desired.tables:
        conn.execute(
            """
            INSERT INTO schema_version_class_hashes
                (id, schema_version_id, class_name, class_hash)
            VALUES (%s, %s, %s, %s)
            """,
            (new_uuid7(), version_id, table.name, table_hash(table)),
        )


def current_version_row(conn: Connection) -> tuple[int, str, str | None] | None:
    """Return ``(id, schema_hash, restore_point_name)`` for the current version, if any."""
    row = conn.execute(
        """
        SELECT id, schema_hash, restore_point_name
        FROM schema_versions
        WHERE superseded_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        return None
    return int(row[0]), str(row[1]), row[2]


def class_hashes_for_version(conn: Connection, version_id: int) -> Sequence[tuple[str, str]]:
    """Return ``(class_name, class_hash)`` rows for ``version_id``."""
    rows = conn.execute(
        """
        SELECT class_name, class_hash
        FROM schema_version_class_hashes
        WHERE schema_version_id = %s
        ORDER BY class_name
        """,
        (version_id,),
    ).fetchall()
    return [(str(r[0]), str(r[1])) for r in rows]
