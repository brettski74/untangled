"""Idempotent seed of the three baseline local users."""

from __future__ import annotations

from datetime import datetime, timezone

from psycopg import Connection, sql

from untangled.auth.passwords import hash_password
from untangled.auth.store import normalize_username
from untangled.seed.users import SEED_USERS, password_for


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


def ensure_stub_actor_user(conn: Connection) -> None:
    """Ensure the stub/admin seed user exists (FK-safe for persistence tests)."""
    seed_users(conn)
