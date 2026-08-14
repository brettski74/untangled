"""SQL helpers for user lookup and refresh-token revoke."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row

from untangled.auth.passwords import verify_password
from untangled.auth.tokens import hash_refresh_token
from untangled.mapping.datetime_utc import utc_now


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


def update_user_password_hash(
    conn: Connection,
    user_id: UUID,
    password_hash: str,
    *,
    actor_id: UUID,
) -> None:
    """Persist a new Argon2id ``password_hash`` for ``user_id`` and commit."""
    now = utc_now()
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "UPDATE {} SET password_hash = {}, updated_at = {}, updated_by = {} "
                "WHERE id = {}"
            ).format(
                sql.Identifier("user"),
                sql.Placeholder(),
                sql.Placeholder(),
                sql.Placeholder(),
                sql.Placeholder(),
            ),
            (password_hash, now, actor_id, user_id),
        )
    conn.commit()


def refresh_token_is_active(conn: Connection, refresh_plaintext: str) -> bool:
    """True when a non-revoked refresh row exists for ``refresh_plaintext``."""
    token_hash = hash_refresh_token(refresh_plaintext)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT id, revoked_at FROM {} WHERE token_hash = {}"
            ).format(sql.Identifier("refresh_token"), sql.Placeholder()),
            (token_hash,),
        )
        row = cur.fetchone()
    return row is not None and row["revoked_at"] is None


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


def _revoke_refresh(conn: Connection, token_id: UUID) -> None:
    now = utc_now()
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
