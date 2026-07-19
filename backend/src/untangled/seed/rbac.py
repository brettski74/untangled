"""Idempotent RBAC seed: roles, permissions, and attachments."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from psycopg import Connection, sql

from untangled.seed.rbac_catalog import (
    SEED_PERMISSIONS,
    SEED_PERMISSIONS_BY_KEY,
    SEED_ROLE_PERMISSIONS,
    SEED_ROLES,
    SEED_USER_ROLES,
)
from untangled.seed.users import SEED_ADMIN_ID


def seed_rbac(conn: Connection) -> dict[str, int]:
    """Upsert roles, permissions, and joins. Returns counts touched per kind."""
    now = datetime.now(timezone.utc)
    actor = SEED_ADMIN_ID
    _upsert_roles(conn, now=now, actor=actor)
    _upsert_permissions(conn, now=now, actor=actor)
    _upsert_role_permissions(conn, now=now, actor=actor)
    _upsert_user_roles(conn, now=now, actor=actor)
    conn.commit()
    return {
        "roles": len(SEED_ROLES),
        "permissions": len(SEED_PERMISSIONS),
        "role_permissions": len(SEED_ROLE_PERMISSIONS),
        "user_roles": len(SEED_USER_ROLES),
    }


def _upsert_roles(conn: Connection, *, now: datetime, actor: UUID) -> None:
    for role in SEED_ROLES:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "name, display_name"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "name = EXCLUDED.name, "
                    "display_name = EXCLUDED.display_name, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.updated_by"
                ).format(
                    sql.Identifier("role"),
                    *[sql.Placeholder() for _ in range(7)],
                ),
                (
                    role.id,
                    now,
                    now,
                    actor,
                    actor,
                    role.name,
                    role.display_name,
                ),
            )


def _upsert_permissions(conn: Connection, *, now: datetime, actor: UUID) -> None:
    for perm in SEED_PERMISSIONS:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "key, class_name, operation"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "key = EXCLUDED.key, "
                    "class_name = EXCLUDED.class_name, "
                    "operation = EXCLUDED.operation, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.updated_by"
                ).format(
                    sql.Identifier("permission"),
                    *[sql.Placeholder() for _ in range(8)],
                ),
                (
                    perm.id,
                    now,
                    now,
                    actor,
                    actor,
                    perm.key,
                    perm.class_name,
                    perm.operation,
                ),
            )


def _upsert_role_permissions(conn: Connection, *, now: datetime, actor: UUID) -> None:
    for link in SEED_ROLE_PERMISSIONS:
        permission = SEED_PERMISSIONS_BY_KEY[link.permission_key]
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "role_id, permission_id"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "role_id = EXCLUDED.role_id, "
                    "permission_id = EXCLUDED.permission_id, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.updated_by"
                ).format(
                    sql.Identifier("role_permission"),
                    *[sql.Placeholder() for _ in range(7)],
                ),
                (
                    link.id,
                    now,
                    now,
                    actor,
                    actor,
                    link.role_id,
                    permission.id,
                ),
            )


def _upsert_user_roles(conn: Connection, *, now: datetime, actor: UUID) -> None:
    for link in SEED_USER_ROLES:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "user_id, role_id"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (id) DO UPDATE SET "
                    "user_id = EXCLUDED.user_id, "
                    "role_id = EXCLUDED.role_id, "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.updated_by"
                ).format(
                    sql.Identifier("user_role"),
                    *[sql.Placeholder() for _ in range(7)],
                ),
                (
                    link.id,
                    now,
                    now,
                    actor,
                    actor,
                    link.user_id,
                    link.role_id,
                ),
            )
