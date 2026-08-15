"""Username length/charset rules and failed_login_count backfill."""

from __future__ import annotations

import pytest
from psycopg import Connection

from untangled.auth.store import normalize_username, username_is_valid, validate_username
from untangled.mapping.well_known import SYSTEM_USER_ID
from untangled.seed.users import SEED_USERS


def test_validate_username_folds_and_accepts_valid() -> None:
    assert validate_username("  Admin ") == "admin"
    assert validate_username("read_only") == "read_only"
    assert validate_username("a" * 3) == "aaa"
    assert validate_username("a" * 32) == "a" * 32


def test_validate_username_rejects_length_and_charset() -> None:
    with pytest.raises(ValueError, match="3-32"):
        validate_username("ab")
    with pytest.raises(ValueError, match="3-32"):
        validate_username("a" * 33)
    with pytest.raises(ValueError, match="3-32"):
        validate_username("admin-user")
    with pytest.raises(ValueError, match="3-32"):
        validate_username("admin.user")
    with pytest.raises(ValueError, match="3-32"):
        validate_username("")


def test_normalize_username_does_not_validate() -> None:
    assert normalize_username("  AB ") == "ab"
    assert username_is_valid("ab") is False


def test_seed_usernames_are_valid() -> None:
    for seed in SEED_USERS:
        assert validate_username(seed.username) == seed.username
    assert validate_username("system") == "system"


def test_username_check_rejects_invalid(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    from datetime import datetime, timezone

    from untangled.persistence.ids import new_uuid7

    now = datetime.now(timezone.utc)
    user_id = new_uuid7()
    with pytest.raises(Exception):
        db_conn.execute(
            """
            INSERT INTO "user" (
                id, created_at, updated_at, created_by, updated_by,
                username, password_hash, display_name, is_active,
                failed_login_count
            ) VALUES (
                %s, %s, %s, %s, %s, %s, 'x', 'Bad', true, 0
            )
            """,
            (user_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID, "ab"),
        )
        db_conn.commit()
    db_conn.rollback()

    with pytest.raises(Exception):
        db_conn.execute(
            """
            INSERT INTO "user" (
                id, created_at, updated_at, created_by, updated_by,
                username, password_hash, display_name, is_active,
                failed_login_count
            ) VALUES (
                %s, %s, %s, %s, %s, %s, 'x', 'Bad', true, 0
            )
            """,
            (user_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID, "Admin"),
        )
        db_conn.commit()
    db_conn.rollback()


def test_failed_login_count_backfill_is_zero(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    row = db_conn.execute(
        'SELECT failed_login_count FROM "user" WHERE username = %s',
        ("admin",),
    ).fetchone()
    assert row is not None
    assert row[0] == 0
