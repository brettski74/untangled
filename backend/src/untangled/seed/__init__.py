"""Idempotent seed of baseline local users and RBAC attachments."""

from __future__ import annotations

from datetime import datetime, timezone

from psycopg import Connection, sql

from untangled.auth.passwords import hash_password
from untangled.auth.store import normalize_username
from untangled.persistence.actor import STUB_ACTOR_ID
from untangled.seed.rbac import seed_rbac
from untangled.seed.tickets import seed_tickets
from untangled.seed.users import SEED_ADMIN_ID, SEED_USERS, password_for

# Placeholder hash only for migrate FK safety; ``make seed`` overwrites with real creds.
_MIGRATE_STUB_PASSWORD = "migrate-stub-not-for-login"


def seed_users(conn: Connection) -> list[str]:
    """Upsert the three seed users. Returns usernames that were inserted or updated."""
    touched: list[str] = []
    now = datetime.now(timezone.utc)
    for seed in SEED_USERS:
        username = normalize_username(seed.username)
        password_hash = hash_password(password_for(seed))
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "username, password_hash, display_name, is_active"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "username = EXCLUDED.username, "
                    "password_hash = EXCLUDED.password_hash, "
                    "display_name = EXCLUDED.display_name, "
                    "is_active = EXCLUDED.is_active, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.id"
                ).format(
                    sql.Identifier("user"),
                    *[sql.Placeholder() for _ in range(9)],
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
                ),
            )
        touched.append(username)
    conn.commit()
    return touched


def seed_all(conn: Connection) -> dict[str, object]:
    """Upsert seed users, RBAC, then sample tickets. Returns a summary dict."""
    usernames = seed_users(conn)
    rbac_counts = seed_rbac(conn)
    tickets = seed_tickets(conn)
    return {"users": usernames, "rbac": rbac_counts, "tickets": tickets}


def upsert_stub_actor(conn: Connection) -> None:
    """Insert ``STUB_ACTOR_ID`` if missing so audit FKs can apply. Does not commit.

    Used by migrate before ``AddForeignKey`` ops that reference ``user``. Leaves
    an existing row untouched (including passwords set by ``seed_users``).
    """
    assert SEED_ADMIN_ID == STUB_ACTOR_ID
    admin = SEED_USERS[0]
    now = datetime.now(timezone.utc)
    username = normalize_username(admin.username)
    password_hash = hash_password(_MIGRATE_STUB_PASSWORD)
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ("
                "id, created_at, updated_at, created_by, updated_by, "
                "username, password_hash, display_name, is_active"
                ") VALUES ("
                "{}, {}, {}, {}, {}, {}, {}, {}, {}"
                ") ON CONFLICT (id) DO NOTHING"
            ).format(
                sql.Identifier("user"),
                *[sql.Placeholder() for _ in range(9)],
            ),
            (
                admin.id,
                now,
                now,
                admin.id,
                admin.id,
                username,
                password_hash,
                admin.display_name,
                True,
            ),
        )


def ensure_stub_actor_user(conn: Connection) -> None:
    """Ensure baseline seed users and RBAC exist (FK-safe for persistence/auth tests)."""
    seed_all(conn)
