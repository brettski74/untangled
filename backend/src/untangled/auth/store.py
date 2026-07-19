"""SQL helpers for user lookup and refresh-token rotation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row

from untangled.auth.passwords import verify_password
from untangled.auth.tokens import (
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
    refresh_expiry,
)
from untangled.persistence.ids import new_uuid7


def normalize_username(username: str) -> str:
    """Case-fold login identifiers for storage and lookup."""
    return username.strip().lower()


def fetch_user_by_username(conn: Connection, username: str) -> dict[str, Any] | None:
    """Return the user row for ``username``, or None."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT id, username, password_hash, display_name, is_active "
                'FROM {} WHERE username = {}'
            ).format(sql.Identifier("user"), sql.Placeholder()),
            (normalize_username(username),),
        )
        row = cur.fetchone()
    return dict(row) if row is not None else None


def fetch_user_by_id(conn: Connection, user_id: UUID) -> dict[str, Any] | None:
    """Return the user row for ``user_id``, or None."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT id, username, password_hash, display_name, is_active "
                'FROM {} WHERE id = {}'
            ).format(sql.Identifier("user"), sql.Placeholder()),
            (user_id,),
        )
        row = cur.fetchone()
    return dict(row) if row is not None else None


def authenticate_user(conn: Connection, username: str, password: str) -> dict[str, Any] | None:
    """Validate credentials; return the user row or None (generic failure)."""
    user = fetch_user_by_username(conn, username)
    if user is None or not user["is_active"]:
        return None
    if not verify_password(user["password_hash"], password):
        return None
    return user


def issue_token_pair(conn: Connection, user_id: UUID) -> tuple[str, str]:
    """Create access + refresh tokens; persist the hashed refresh token."""
    access = create_access_token(user_id)
    refresh = new_refresh_token()
    _insert_refresh_token(conn, user_id=user_id, token_plaintext=refresh)
    conn.commit()
    return access, refresh


def rotate_refresh_token(conn: Connection, refresh_plaintext: str) -> tuple[str, str] | None:
    """Atomically claim ``refresh_plaintext`` and return a new pair, or None.

    Concurrent callers cannot both claim the same token. Inactive or missing
    users fail closed: the refresh row stays revoked and no new pair is issued.
    """
    row = _claim_valid_refresh(conn, refresh_plaintext)
    if row is None:
        return None
    user = fetch_user_by_id(conn, row["user_id"])
    if user is None or not user["is_active"]:
        conn.commit()
        return None
    return issue_token_pair(conn, row["user_id"])


def revoke_refresh_token(conn: Connection, refresh_plaintext: str) -> bool:
    """Revoke a refresh token if present and not already revoked. Returns whether revoked."""
    token_hash = hash_refresh_token(refresh_plaintext)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT id, revoked_at FROM {} WHERE token_hash = {}"
            ).format(sql.Identifier("refresh_token"), sql.Placeholder()),
            (token_hash,),
        )
        row = cur.fetchone()
    if row is None or row["revoked_at"] is not None:
        return False
    _revoke_refresh(conn, row["id"])
    conn.commit()
    return True


def _insert_refresh_token(conn: Connection, *, user_id: UUID, token_plaintext: str) -> None:
    now = datetime.now(timezone.utc)
    row_id = new_uuid7()
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ("
                "id, created_at, updated_at, created_by, updated_by, "
                "user_id, token_hash, expires_at, revoked_at"
                ") VALUES ("
                "{}, {}, {}, {}, {}, {}, {}, {}, {}"
                ")"
            ).format(
                sql.Identifier("refresh_token"),
                *[sql.Placeholder() for _ in range(9)],
            ),
            (
                row_id,
                now,
                now,
                user_id,
                user_id,
                user_id,
                hash_refresh_token(token_plaintext),
                refresh_expiry(now=now),
                None,
            ),
        )


def _claim_valid_refresh(conn: Connection, refresh_plaintext: str) -> dict[str, Any] | None:
    """Revoke a still-valid refresh token in one statement; return its id/user_id."""
    token_hash = hash_refresh_token(refresh_plaintext)
    now = datetime.now(timezone.utc)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "UPDATE {} SET revoked_at = {}, updated_at = {} "
                "WHERE token_hash = {} "
                "AND revoked_at IS NULL "
                "AND expires_at > {} "
                "RETURNING id, user_id"
            ).format(
                sql.Identifier("refresh_token"),
                sql.Placeholder(),
                sql.Placeholder(),
                sql.Placeholder(),
                sql.Placeholder(),
            ),
            (now, now, token_hash, now),
        )
        row = cur.fetchone()
    return dict(row) if row is not None else None


def _revoke_refresh(conn: Connection, token_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "UPDATE {} SET revoked_at = {}, updated_at = {} WHERE id = {}"
            ).format(
                sql.Identifier("refresh_token"),
                sql.Placeholder(),
                sql.Placeholder(),
                sql.Placeholder(),
            ),
            (now, now, token_id),
        )
