"""Idempotent seed of baseline local users and RBAC attachments."""

from __future__ import annotations

from datetime import timedelta

from psycopg import Connection, sql

from untangled.auth.passwords import hash_password
from untangled.auth.store import validate_username
from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.well_known import SECONDS_PER_DAY, SYSTEM_USER_ID
from untangled.seed.rbac import seed_rbac
from untangled.seed.tickets import seed_tickets
from untangled.seed.users import SEED_USERS, password_for

SYSTEM_USER_USERNAME = "system"
SYSTEM_USER_DISPLAY_NAME = "System"
# Not an Argon2 hash — verify_password always fails (InvalidHashError).
SYSTEM_USER_PASSWORD_HASH = "untangled-system-not-a-password-hash"


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


def upsert_system_user(conn: Connection) -> None:
    """Ensure the platform system principal exists in non-login shape.

    Does not commit. No-op when ``user`` is absent. When ``user_role`` exists,
    removes any role attachments for this principal.
    """
    if not _relation_exists(conn, "user"):
        return

    now = utc_now()
    username = validate_username(SYSTEM_USER_USERNAME)
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ("
                "id, created_at, updated_at, created_by, updated_by, "
                "username, password_hash, display_name, is_active, "
                "failed_login_count, password_expires_at"
                ") VALUES ("
                "{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}"
                ") ON CONFLICT (id) DO UPDATE SET "
                "username = EXCLUDED.username, "
                "password_hash = EXCLUDED.password_hash, "
                "display_name = EXCLUDED.display_name, "
                "is_active = EXCLUDED.is_active, "
                "password_expires_at = EXCLUDED.password_expires_at, "
                "updated_at = EXCLUDED.updated_at, "
                "updated_by = EXCLUDED.updated_by"
            ).format(
                sql.Identifier("user"),
                *[sql.Placeholder() for _ in range(11)],
            ),
            (
                SYSTEM_USER_ID,
                now,
                now,
                SYSTEM_USER_ID,
                SYSTEM_USER_ID,
                username,
                SYSTEM_USER_PASSWORD_HASH,
                SYSTEM_USER_DISPLAY_NAME,
                False,
                0,
                now,
            ),
        )

    if not _relation_exists(conn, "user_role"):
        return

    from untangled.audit.deps import ensure_audit_logger
    from untangled.audit.emit import emit_fail_closed, make_event
    from untangled.audit.types import ActorChannel, EventType, Outcome, Severity

    # Fail-closed: privilege mutation must not proceed without a durable audit attempt.
    ensure_audit_logger()
    emit_fail_closed(
        make_event(
            event_type=EventType.RBAC_PRIVILEGE_CHANGE,
            actor_channel=ActorChannel.SYSTEM,
            outcome=Outcome.SUCCESS,
            reason="system_user_clear_roles",
            severity=Severity.NOTICE,
            user_id=SYSTEM_USER_ID,
            data={"user_id": str(SYSTEM_USER_ID), "action": "delete_user_roles"},
        )
    )

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("DELETE FROM {} WHERE {} = {}").format(
                sql.Identifier("user_role"),
                sql.Identifier("user_id"),
                sql.Placeholder(),
            ),
            (SYSTEM_USER_ID,),
        )


def seed_users(conn: Connection) -> list[str]:
    """Upsert baseline seed users. Returns usernames that were inserted or updated."""
    touched: list[str] = []
    now = utc_now()
    # Transitional until #210 file-based seeds: ${tomorrow} so migrate ${now}
    # backfill does not leave baseline accounts in must-change.
    seed_expiry = now + timedelta(seconds=SECONDS_PER_DAY)
    for seed in SEED_USERS:
        username = validate_username(seed.username)
        password_hash = hash_password(password_for(seed))
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "username, password_hash, display_name, is_active, "
                    "failed_login_count, password_expires_at"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "username = EXCLUDED.username, "
                    "password_hash = EXCLUDED.password_hash, "
                    "display_name = EXCLUDED.display_name, "
                    "is_active = EXCLUDED.is_active, "
                    "password_expires_at = EXCLUDED.password_expires_at, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.id"
                ).format(
                    sql.Identifier("user"),
                    *[sql.Placeholder() for _ in range(11)],
                ),
                (
                    seed.id,
                    now,
                    now,
                    seed.id,
                    seed.id,
                    username,
                    password_hash,
                    seed.display_name,
                    True,
                    0,
                    seed_expiry,
                ),
            )
        touched.append(username)
    conn.commit()
    return touched


def seed_all(conn: Connection) -> dict[str, object]:
    """Upsert seed users, RBAC, then sample tickets. Returns a summary dict."""
    upsert_system_user(conn)
    usernames = seed_users(conn)
    rbac_counts = seed_rbac(conn)
    upsert_system_user(conn)
    conn.commit()
    tickets = seed_tickets(conn)
    return {"users": usernames, "rbac": rbac_counts, "tickets": tickets}


def ensure_stub_actor_user(conn: Connection) -> None:
    """Ensure baseline seed users and RBAC exist (FK-safe for persistence/auth tests)."""
    seed_all(conn)
