"""Idempotent RBAC seed: roles, permissions, hierarchy, and attachments."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from psycopg import Connection, sql

from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.well_known import SYSTEM_USER_ID
from untangled.rbac.authz_version_bootstrap import ensure_authz_version_row
from untangled.rbac.store import bump_global_authz_version
from untangled.seed.rbac_catalog import (
    LEGACY_SEED_PERMISSION_KEYS,
    SEED_ROLES,
    SEED_USER_ROLES,
    SeedPermission,
    SeedRoleChild,
    SeedRolePermission,
    seed_permissions,
    seed_permissions_by_key,
    seed_role_children,
    seed_role_permissions,
)


def seed_rbac(conn: Connection) -> dict[str, int]:
    """Upsert roles, permissions, hierarchy, and joins. Returns counts touched."""
    now = utc_now()
    actor = SYSTEM_USER_ID
    permissions = seed_permissions()
    permissions_by_key = seed_permissions_by_key()
    catalog_keys = {p.key for p in permissions}
    role_permissions = seed_role_permissions()
    role_children = seed_role_children()
    ensure_authz_version_row(conn)
    _upsert_roles(conn, now=now, actor=actor)
    _reconcile_permissions(
        conn,
        permissions=permissions,
        catalog_keys=catalog_keys,
        now=now,
        actor=actor,
    )
    _upsert_role_permissions(
        conn,
        role_permissions=role_permissions,
        permissions_by_key=permissions_by_key,
        now=now,
        actor=actor,
    )
    _upsert_role_children(
        conn, role_children=role_children, now=now, actor=actor
    )
    _upsert_user_roles(conn, now=now, actor=actor)
    bump_global_authz_version(conn)
    counts = {
        "roles": len(SEED_ROLES),
        "permissions": len(permissions),
        "role_permissions": len(role_permissions),
        "role_children": len(role_children),
        "user_roles": len(SEED_USER_ROLES),
    }
    from untangled.audit.deps import ensure_audit_logger
    from untangled.audit.emit import emit_fail_closed, make_event
    from untangled.audit.types import ActorChannel, EventType, Outcome, Severity

    ensure_audit_logger()
    try:
        emit_fail_closed(
            make_event(
                event_type=EventType.RBAC_PRIVILEGE_CHANGE,
                actor_channel=ActorChannel.OPERATOR,
                outcome=Outcome.SUCCESS,
                reason="seed_rbac",
                severity=Severity.NOTICE,
                user_id=SYSTEM_USER_ID,
                data=counts,
            )
        )
    except Exception:
        conn.rollback()
        raise
    conn.commit()
    return counts


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


def _reconcile_permissions(
    conn: Connection,
    *,
    permissions: tuple,
    catalog_keys: set[str],
    now: datetime,
    actor: UUID,
) -> None:
    """Upsert catalog permissions by key; rewrite join FKs when ids change.

    Obsolete cleanup is limited to keys that the pre-#185 hard-coded seed matrix
    produced and that are absent from the new catalog. Unknown/operator-added
    permission keys are left alone.
    """
    for perm in permissions:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM permission WHERE key = %s",
                (perm.key,),
            )
            row = cur.fetchone()
            if row is not None and row[0] != perm.id:
                existing_id = row[0]
                # Drop joins then replace the row so the PK can change under FKs.
                cur.execute(
                    "DELETE FROM role_permission WHERE permission_id = %s",
                    (existing_id,),
                )
                cur.execute(
                    "DELETE FROM permission WHERE id = %s",
                    (existing_id,),
                )
                row = None

            if row is None:
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
            else:
                cur.execute(
                    "UPDATE permission SET "
                    "class_name = %s, operation = %s, "
                    "updated_at = %s, updated_by = %s "
                    "WHERE key = %s",
                    (
                        perm.class_name,
                        perm.operation,
                        now,
                        actor,
                        perm.key,
                    ),
                )

    obsolete = LEGACY_SEED_PERMISSION_KEYS - catalog_keys
    if not obsolete:
        return
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM permission WHERE key = ANY(%s)",
            (list(obsolete),),
        )
        rows = cur.fetchall()
        for (permission_id,) in rows:
            cur.execute(
                "DELETE FROM role_permission WHERE permission_id = %s",
                (permission_id,),
            )
            cur.execute(
                "DELETE FROM permission WHERE id = %s",
                (permission_id,),
            )


def _upsert_role_permissions(
    conn: Connection,
    *,
    role_permissions: tuple[SeedRolePermission, ...],
    permissions_by_key: dict[str, SeedPermission],
    now: datetime,
    actor: UUID,
) -> None:
    seed_role_ids = [role.id for role in SEED_ROLES]
    keep_pairs = [
        (link.role_id, permissions_by_key[link.permission_key].id)
        for link in role_permissions
    ]
    with conn.cursor() as cur:
        if keep_pairs:
            cur.execute(
                "DELETE FROM role_permission rp "
                "WHERE rp.role_id = ANY(%s) AND NOT EXISTS ("
                "  SELECT 1 FROM unnest(%s::uuid[], %s::uuid[]) AS k(role_id, permission_id) "
                "  WHERE k.role_id = rp.role_id AND k.permission_id = rp.permission_id"
                ")",
                (
                    seed_role_ids,
                    [pair[0] for pair in keep_pairs],
                    [pair[1] for pair in keep_pairs],
                ),
            )
        else:
            cur.execute(
                "DELETE FROM role_permission WHERE role_id = ANY(%s)",
                (seed_role_ids,),
            )
    for link in role_permissions:
        permission = permissions_by_key[link.permission_key]
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "role_id, permission_id"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (role_id, permission_id) DO UPDATE SET "
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


def _upsert_role_children(
    conn: Connection,
    *,
    role_children: tuple[SeedRoleChild, ...],
    now: datetime,
    actor: UUID,
) -> None:
    seed_role_ids = [role.id for role in SEED_ROLES]
    keep_pairs = [
        (link.parent_role_id, link.child_role_id) for link in role_children
    ]
    with conn.cursor() as cur:
        if keep_pairs:
            cur.execute(
                "DELETE FROM role_child rc "
                "WHERE rc.parent_role_id = ANY(%s) AND NOT EXISTS ("
                "  SELECT 1 FROM unnest(%s::uuid[], %s::uuid[]) "
                "  AS k(parent_role_id, child_role_id) "
                "  WHERE k.parent_role_id = rc.parent_role_id "
                "    AND k.child_role_id = rc.child_role_id"
                ")",
                (
                    seed_role_ids,
                    [pair[0] for pair in keep_pairs],
                    [pair[1] for pair in keep_pairs],
                ),
            )
        else:
            cur.execute(
                "DELETE FROM role_child WHERE parent_role_id = ANY(%s)",
                (seed_role_ids,),
            )
    for link in role_children:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "INSERT INTO {} ("
                    "id, created_at, updated_at, created_by, updated_by, "
                    "parent_role_id, child_role_id"
                    ") VALUES ("
                    "{}, {}, {}, {}, {}, {}, {}"
                    ") ON CONFLICT (parent_role_id, child_role_id) DO UPDATE SET "
                    "updated_at = EXCLUDED.updated_at, "
                    "updated_by = EXCLUDED.updated_by"
                ).format(
                    sql.Identifier("role_child"),
                    *[sql.Placeholder() for _ in range(7)],
                ),
                (
                    link.id,
                    now,
                    now,
                    actor,
                    actor,
                    link.parent_role_id,
                    link.child_role_id,
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
