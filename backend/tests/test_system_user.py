"""Platform system principal: migrate existence, non-login shape, attribution."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from psycopg import Connection, sql

from untangled.auth.passwords import verify_password
from untangled.mapping.well_known import SYSTEM_USER_ID
from untangled.persistence.ids import new_uuid7
from untangled.rbac.store import (
    fetch_effective_permission_keys,
    fetch_role_names_for_user,
)
from untangled.schema.migrate import migrate
from untangled.seed import SYSTEM_USER_PASSWORD_HASH
from untangled.seed.users import SEED_ADMIN_ID


def _drop_managed(conn: Connection, repo_definitions: Path) -> None:
    from untangled.schema import desired_schema_from_definitions

    desired = desired_schema_from_definitions(repo_definitions)
    for name in sorted(t.name for t in desired.tables):
        conn.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(name)))
    for name in sorted(s.name for s in desired.sequences):
        conn.execute(sql.SQL("DROP SEQUENCE IF EXISTS {}").format(sql.Identifier(name)))
    conn.execute("DROP TABLE IF EXISTS schema_version_class_hashes CASCADE")
    conn.execute("DROP TABLE IF EXISTS schema_versions CASCADE")
    conn.commit()


def _system_row(conn: Connection) -> tuple:
    return conn.execute(
        """
        SELECT username, display_name, is_active, password_hash, created_by, updated_by
        FROM "user" WHERE id = %s
        """,
        (SYSTEM_USER_ID,),
    ).fetchone()


def test_migrate_only_creates_inactive_system_user(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    result = migrate(db_conn, repo_definitions)
    assert result.applied

    row = _system_row(db_conn)
    assert row is not None
    username, display_name, is_active, password_hash, created_by, updated_by = row
    assert username == "system"
    assert display_name == "System"
    assert is_active is False
    assert password_hash == SYSTEM_USER_PASSWORD_HASH
    assert not password_hash.startswith("$argon2")
    assert verify_password(password_hash, "admin-change-me") is False
    assert verify_password(password_hash, SYSTEM_USER_PASSWORD_HASH) is False
    assert created_by == SYSTEM_USER_ID
    assert updated_by == SYSTEM_USER_ID
    assert fetch_role_names_for_user(db_conn, SYSTEM_USER_ID) == []
    assert fetch_effective_permission_keys(db_conn, SYSTEM_USER_ID) == frozenset()
    assert db_conn.execute(
        'SELECT 1 FROM "user" WHERE id = %s',
        (SEED_ADMIN_ID,),
    ).fetchone() is None


def test_noop_migrate_restores_system_user_shape(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    first = migrate(db_conn, repo_definitions)
    assert first.applied

    role_id = new_uuid7()
    join_id = new_uuid7()
    now = datetime.now(timezone.utc)
    db_conn.execute(
        """
        INSERT INTO role (
            id, created_at, updated_at, created_by, updated_by, name, display_name
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (role_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID, "tmp-role", "Tmp"),
    )
    db_conn.execute(
        """
        INSERT INTO user_role (
            id, created_at, updated_at, created_by, updated_by, user_id, role_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (join_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID, SYSTEM_USER_ID, role_id),
    )
    db_conn.execute(
        """
        UPDATE "user"
        SET is_active = TRUE, display_name = 'Hacked', password_hash = 'not-the-sentinel'
        WHERE id = %s
        """,
        (SYSTEM_USER_ID,),
    )
    db_conn.commit()
    assert fetch_role_names_for_user(db_conn, SYSTEM_USER_ID) == ["tmp-role"]

    messages: list[str] = []
    second = migrate(db_conn, repo_definitions, progress=messages.append)
    assert second.applied is False
    assert any("ensure system user" in m for m in messages)

    username, display_name, is_active, password_hash, _, _ = _system_row(db_conn)
    assert username == "system"
    assert display_name == "System"
    assert is_active is False
    assert password_hash == SYSTEM_USER_PASSWORD_HASH
    assert fetch_role_names_for_user(db_conn, SYSTEM_USER_ID) == []


def test_seed_rbac_stamps_system_user(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    stamped = db_conn.execute(
        "SELECT DISTINCT created_by, updated_by FROM role",
    ).fetchall()
    assert stamped == [(SYSTEM_USER_ID, SYSTEM_USER_ID)]
    assert fetch_role_names_for_user(db_conn, SYSTEM_USER_ID) == []
    assert fetch_effective_permission_keys(db_conn, SYSTEM_USER_ID) == frozenset()
