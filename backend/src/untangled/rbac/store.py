"""SQL helpers for role/permission resolution.

Composition semantics (union-only, directional):

- Granting role A (with children B, C) is equivalent to granting B and C plus any
  permissions that appear only under A.
- Granting B does not imply permissions under A or C (siblings/parent).
- Effective permissions for a role = set-union of that role's direct permissions
  and each child's effective permissions, recursively.
- Effective permissions for a user = set-union of the effective sets of every
  role directly assigned to that user.
- Cycles and nestings deeper than ``MAX_ROLE_GRAPH_DEPTH`` fail closed.
- ``admin`` remains an allow-all short-circuit via ``permission_grants``.

The flatten SQL lives in ``sql/effective_permissions.sql`` and must stay
byte-identical to ``auth/src/rbac/effective_permissions.sql``.
"""

from __future__ import annotations

from functools import lru_cache
from importlib import resources
from pathlib import Path
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row

from untangled.mapping.well_known import AUTHZ_VERSION_ID
from untangled.rbac.keys import ADMIN_PERMISSION_KEY, permission_grants

# Inclusive: directly assigned roles are depth 1. Exceeding this fails closed.
MAX_ROLE_GRAPH_DEPTH = 16


class RoleGraphError(RuntimeError):
    """Role graph is cyclic or exceeds the documented depth bound."""


@lru_cache(maxsize=1)
def effective_permissions_sql_raw() -> str:
    """Return the shared flatten SQL with ``__P1__``/``__P2__`` tokens."""
    # Prefer the package file next to this module (editable installs + wheels).
    path = Path(__file__).resolve().parent / "sql" / "effective_permissions.sql"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    ref = resources.files("untangled.rbac").joinpath("sql/effective_permissions.sql")
    return ref.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def effective_permissions_sql() -> str:
    """Return the shared flatten SQL adapted for psycopg (``%s`` placeholders)."""
    return (
        effective_permissions_sql_raw()
        .replace("__P1__", "%s")
        .replace("__P2__", "%s")
    )


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


def fetch_global_authz_version(conn: Connection) -> int:
    """Return the committed Postgres global authz version (source of truth)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT version FROM authz_version WHERE id = %s",
            (AUTHZ_VERSION_ID,),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError("authz_version singleton row is missing")
    return int(row[0])


def bump_global_authz_version(conn: Connection) -> int:
    """Increment the Postgres global authz version; return the new value.

    Must run in the same transaction as the privilege mutation. Does not commit.
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE authz_version SET version = version + 1, "
            "updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s RETURNING version",
            (AUTHZ_VERSION_ID,),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError("authz_version singleton row is missing; cannot bump")
    return int(row[0])


def fetch_effective_permission_keys(conn: Connection, user_id: UUID) -> frozenset[str]:
    """Return the recursive union of permission keys for ``user_id``.

    Fails closed on cycle or depth overflow. Does not consult Redis.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            effective_permissions_sql(),
            (user_id, MAX_ROLE_GRAPH_DEPTH),
        )
        rows = cur.fetchall()
    if not rows:
        return frozenset()
    if any(bool(row["has_cycle"]) for row in rows):
        raise RoleGraphError(
            f"role graph cycle detected while resolving permissions for user {user_id}"
        )
    if any(bool(row["depth_exceeded"]) for row in rows):
        raise RoleGraphError(
            f"role graph exceeds max depth {MAX_ROLE_GRAPH_DEPTH} "
            f"while resolving permissions for user {user_id}"
        )
    return frozenset(str(row["key"]) for row in rows if row["key"] is not None)


def would_create_role_cycle(
    conn: Connection,
    *,
    parent_role_id: UUID,
    child_role_id: UUID,
) -> bool:
    """Return True if adding parent→child would introduce a cycle."""
    if parent_role_id == child_role_id:
        return True
    # Walk descendants of child; if parent appears, the new edge closes a cycle.
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH RECURSIVE descendants AS (
              SELECT %s::uuid AS role_id, 1 AS depth
              UNION ALL
              SELECT rc.child_role_id, d.depth + 1
              FROM descendants d
              INNER JOIN role_child rc ON rc.parent_role_id = d.role_id
              WHERE d.depth < %s
            )
            CYCLE role_id SET is_cycle USING path
            SELECT 1
            FROM descendants
            WHERE role_id = %s
            LIMIT 1
            """,
            (child_role_id, MAX_ROLE_GRAPH_DEPTH, parent_role_id),
        )
        return cur.fetchone() is not None


def assert_role_child_edge_allowed(
    conn: Connection,
    *,
    parent_role_id: UUID,
    child_role_id: UUID,
) -> None:
    """Reject edges that would create a cycle (depth is enforced at resolve time)."""
    if would_create_role_cycle(
        conn, parent_role_id=parent_role_id, child_role_id=child_role_id
    ):
        raise RoleGraphError(
            "refusing role_child edge that would create a cycle "
            f"(parent={parent_role_id}, child={child_role_id})"
        )


def user_has_permission(conn: Connection, user_id: UUID, required: str) -> bool:
    """True if the user's effective permissions satisfy ``required``."""
    return permission_grants(fetch_effective_permission_keys(conn, user_id), required)


def user_has_admin(conn: Connection, user_id: UUID) -> bool:
    """True if the user holds the allow-all ``admin`` permission."""
    return ADMIN_PERMISSION_KEY in fetch_effective_permission_keys(conn, user_id)
