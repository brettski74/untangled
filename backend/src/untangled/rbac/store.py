"""SQL helpers for role/permission resolution."""

from __future__ import annotations

from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row

from untangled.rbac.keys import ADMIN_PERMISSION_KEY, permission_grants


def fetch_role_names_for_user(conn: Connection, user_id: UUID) -> list[str]:
    """Return sorted role ``name`` values assigned to ``user_id``."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT r.name AS name "
                "FROM {} ur "
                "JOIN {} r ON r.id = ur.role_id "
                "WHERE ur.user_id = {} "
                "ORDER BY r.name"
            ).format(
                sql.Identifier("user_role"),
                sql.Identifier("role"),
                sql.Placeholder(),
            ),
            (user_id,),
        )
        rows = cur.fetchall()
    return [str(row["name"]) for row in rows]


def fetch_effective_permission_keys(conn: Connection, user_id: UUID) -> frozenset[str]:
    """Return the union of permission keys from all roles assigned to ``user_id``."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL(
                "SELECT DISTINCT p.key AS key "
                "FROM {} ur "
                "JOIN {} rp ON rp.role_id = ur.role_id "
                "JOIN {} p ON p.id = rp.permission_id "
                "WHERE ur.user_id = {}"
            ).format(
                sql.Identifier("user_role"),
                sql.Identifier("role_permission"),
                sql.Identifier("permission"),
                sql.Placeholder(),
            ),
            (user_id,),
        )
        rows = cur.fetchall()
    return frozenset(str(row["key"]) for row in rows)


def user_has_permission(conn: Connection, user_id: UUID, required: str) -> bool:
    """True if the user's effective permissions satisfy ``required``."""
    return permission_grants(fetch_effective_permission_keys(conn, user_id), required)


def user_has_admin(conn: Connection, user_id: UUID) -> bool:
    """True if the user holds the allow-all ``admin`` permission."""
    return ADMIN_PERMISSION_KEY in fetch_effective_permission_keys(conn, user_id)
