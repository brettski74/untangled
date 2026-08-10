"""DB-backed RBAC seed and permission-resolution tests."""

from __future__ import annotations

from uuid import uuid4

from psycopg import Connection, sql

from untangled.persistence.ids import new_uuid7
from untangled.rbac.keys import (
    ADMIN_PERMISSION_KEY,
    class_operation_key,
    permission_id_for_key,
)
from untangled.rbac.store import (
    fetch_effective_permission_keys,
    fetch_role_names_for_user,
    user_has_permission,
)
from untangled.seed import seed_all
from untangled.seed.rbac_catalog import (
    SEED_ROLES,
    SEED_USER_ROLES,
    seed_permissions,
)
from untangled.seed.users import (
    SEED_ADMIN_ID,
    SEED_CHANGE_ID,
    SEED_INCIDENT_ID,
    SEED_READONLY_ID,
    SEED_READWRITE_ID,
    SEED_USERS,
)

_SEED_ROLE_CLASSES = ("demo_item", "incident", "change_request")


def test_seed_attaches_roles_to_users(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    assert fetch_role_names_for_user(db_conn, SEED_ADMIN_ID) == ["admin"]
    assert fetch_role_names_for_user(db_conn, SEED_READONLY_ID) == ["read_only"]
    assert fetch_role_names_for_user(db_conn, SEED_READWRITE_ID) == ["read_write"]
    assert fetch_role_names_for_user(db_conn, SEED_CHANGE_ID) == [
        "change_request_read_write"
    ]
    assert fetch_role_names_for_user(db_conn, SEED_INCIDENT_ID) == [
        "incident_read_only"
    ]
    assert len(SEED_USER_ROLES) == 5
    assert {r.name for r in SEED_ROLES} == {
        "admin",
        "read_only",
        "read_write",
        "change_request_read_write",
        "incident_read_only",
    }


def test_seed_permission_catalog_from_class_yaml(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    catalog = seed_permissions()
    with db_conn.cursor() as cur:
        cur.execute("SELECT key, id FROM permission ORDER BY key")
        rows = cur.fetchall()
    keys = {row[0] for row in rows}
    by_key = {row[0]: row[1] for row in rows}
    assert ADMIN_PERMISSION_KEY in keys
    for class_name in _SEED_ROLE_CLASSES:
        for operation in ("create", "read", "search", "update", "delete"):
            key = class_operation_key(class_name, operation)
            assert key in keys
            assert by_key[key] == permission_id_for_key(key)
    assert class_operation_key("demo_link", "read") in keys
    assert class_operation_key("system_config", "read") in keys
    assert class_operation_key("system_config", "update") in keys
    assert class_operation_key("system_config", "search") not in keys
    assert class_operation_key("user", "read") not in keys
    assert by_key[ADMIN_PERMISSION_KEY] == permission_id_for_key(ADMIN_PERMISSION_KEY)
    assert len(keys) == len(catalog)
    assert {p.key for p in catalog} == keys


def test_admin_effective_permissions_are_admin_only_row(
    demo_schema, db_conn: Connection
) -> None:
    """Admin role grants the admin permission key (helpers treat it as allow-all)."""
    assert demo_schema
    keys = fetch_effective_permission_keys(db_conn, SEED_ADMIN_ID)
    assert keys == frozenset({ADMIN_PERMISSION_KEY})
    assert user_has_permission(db_conn, SEED_ADMIN_ID, "demo_item:delete")
    assert user_has_permission(db_conn, SEED_ADMIN_ID, "incident:create")


def test_readonly_and_readwrite_effective_sets(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    readonly = fetch_effective_permission_keys(db_conn, SEED_READONLY_ID)
    readwrite = fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID)

    expected_read = frozenset()
    for c in _SEED_ROLE_CLASSES:
        expected_read |= {
            class_operation_key(c, "read"),
            class_operation_key(c, "search"),
        }
    assert readonly == expected_read
    assert ADMIN_PERMISSION_KEY not in readonly
    assert not any(k.endswith(":delete") for k in readonly)

    for class_name in _SEED_ROLE_CLASSES:
        for operation in ("create", "read", "search", "update"):
            assert class_operation_key(class_name, operation) in readwrite
        assert class_operation_key(class_name, "delete") not in readwrite
    assert ADMIN_PERMISSION_KEY not in readwrite
    assert not user_has_permission(db_conn, SEED_READWRITE_ID, "demo_item:delete")
    assert user_has_permission(db_conn, SEED_READWRITE_ID, "demo_item:update")


def test_change_and_incident_scoped_effective_sets(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    change_keys = fetch_effective_permission_keys(db_conn, SEED_CHANGE_ID)
    incident_keys = fetch_effective_permission_keys(db_conn, SEED_INCIDENT_ID)

    assert change_keys == frozenset(
        {
            class_operation_key("change_request", "create"),
            class_operation_key("change_request", "read"),
            class_operation_key("change_request", "search"),
            class_operation_key("change_request", "update"),
        }
    )
    assert not user_has_permission(db_conn, SEED_CHANGE_ID, "incident:read")
    assert not user_has_permission(db_conn, SEED_CHANGE_ID, "demo_item:read")
    assert not user_has_permission(db_conn, SEED_CHANGE_ID, "change_request:delete")

    assert incident_keys == frozenset(
        {
            class_operation_key("incident", "read"),
            class_operation_key("incident", "search"),
        }
    )
    assert not user_has_permission(db_conn, SEED_INCIDENT_ID, "incident:create")
    assert not user_has_permission(db_conn, SEED_INCIDENT_ID, "change_request:read")
    assert not user_has_permission(db_conn, SEED_INCIDENT_ID, "demo_item:read")


def test_multi_role_union(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    # Attach read_only role to the read_write user as a second role.
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    join_id = new_uuid7()
    with db_conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ("
                "id, created_at, updated_at, created_by, updated_by, "
                "user_id, role_id"
                ") VALUES ("
                "{}, {}, {}, {}, {}, {}, {}"
                ")"
            ).format(
                sql.Identifier("user_role"),
                *[sql.Placeholder() for _ in range(7)],
            ),
            (
                join_id,
                now,
                now,
                SEED_ADMIN_ID,
                SEED_ADMIN_ID,
                SEED_READWRITE_ID,
                next(r.id for r in SEED_ROLES if r.name == "read_only"),
            ),
        )
    db_conn.commit()

    roles = fetch_role_names_for_user(db_conn, SEED_READWRITE_ID)
    assert roles == ["read_only", "read_write"]
    keys = fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID)
    assert class_operation_key("demo_item", "read") in keys
    assert class_operation_key("demo_item", "search") in keys
    assert class_operation_key("demo_item", "create") in keys
    assert class_operation_key("demo_item", "delete") not in keys


def test_seed_all_is_idempotent(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    first = seed_all(db_conn)
    second = seed_all(db_conn)
    assert first["rbac"] == second["rbac"]
    catalog = seed_permissions()
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM role")
        assert cur.fetchone()[0] == len(SEED_ROLES)
        cur.execute("SELECT COUNT(*) FROM permission")
        assert cur.fetchone()[0] == len(catalog)
        cur.execute("SELECT COUNT(*) FROM user_role")
        assert cur.fetchone()[0] == len(SEED_USER_ROLES)
    assert {u.username for u in SEED_USERS} == {
        "admin",
        "readonly",
        "readwrite",
        "change",
        "incident",
    }


def test_unknown_user_has_empty_permissions(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    missing = uuid4()
    assert fetch_role_names_for_user(db_conn, missing) == []
    assert fetch_effective_permission_keys(db_conn, missing) == frozenset()
    assert not user_has_permission(db_conn, missing, "demo_item:read")


def test_permission_id_for_key_is_stable() -> None:
    assert permission_id_for_key("admin") == permission_id_for_key("admin")
    assert permission_id_for_key("incident:search") == permission_id_for_key(
        "incident:search"
    )
    assert permission_id_for_key("admin") != permission_id_for_key("incident:read")
