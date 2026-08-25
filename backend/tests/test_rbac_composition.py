"""Role composition: recursive union, directional semantics, cycle/depth bounds."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from psycopg import Connection, errors
from psycopg.rows import dict_row

from untangled.mapping.well_known import AUTHZ_VERSION_ID, SYSTEM_USER_ID
from untangled.persistence.ids import new_uuid7
from untangled.rbac.authz_version_bootstrap import ensure_authz_version_row
from untangled.rbac.store import (
    MAX_ROLE_GRAPH_DEPTH,
    RoleGraphError,
    assert_role_child_edge_allowed,
    effective_permissions_sql,
    fetch_effective_permission_keys,
    fetch_global_authz_version,
    would_create_role_cycle,
)
from untangled.seed import seed_all
from untangled.seed.users import (
    SEED_ADMIN_ID,
    SEED_CHANGE_ID,
    SEED_INCIDENT_ID,
    SEED_READONLY_ID,
    SEED_READWRITE_ID,
)

_NOW = datetime.now(timezone.utc)


def _insert_role(conn: Connection, *, role_id: UUID, name: str) -> None:
    conn.execute(
        "INSERT INTO role (id, created_at, updated_at, created_by, updated_by, "
        "name, display_name) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (role_id, _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, name, name),
    )


def _insert_permission(conn: Connection, *, perm_id: UUID, key: str) -> None:
    conn.execute(
        "INSERT INTO permission (id, created_at, updated_at, created_by, updated_by, "
        "key, class_name, operation) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (perm_id, _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, key, None, None),
    )


def _grant(conn: Connection, *, role_id: UUID, permission_id: UUID) -> None:
    conn.execute(
        "INSERT INTO role_permission (id, created_at, updated_at, created_by, "
        "updated_by, role_id, permission_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, role_id, permission_id),
    )


def _link_child(conn: Connection, *, parent: UUID, child: UUID) -> None:
    assert_role_child_edge_allowed(
        conn, parent_role_id=parent, child_role_id=child
    )
    conn.execute(
        "INSERT INTO role_child (id, created_at, updated_at, created_by, updated_by, "
        "parent_role_id, child_role_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, parent, child),
    )


def _assign(conn: Connection, *, user_id: UUID, role_id: UUID) -> None:
    conn.execute(
        "INSERT INTO user_role (id, created_at, updated_at, created_by, updated_by, "
        "user_id, role_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, user_id, role_id),
    )


def _epic_graph(conn: Connection) -> dict[str, UUID]:
    """Build the epic parent/childA/childB/childC example; return role ids."""
    ids = {
        "child_a": new_uuid7(),
        "child_b": new_uuid7(),
        "child_c": new_uuid7(),
        "parent": new_uuid7(),
    }
    for name, role_id in ids.items():
        _insert_role(conn, role_id=role_id, name=f"comp_{name}_{role_id.hex[:8]}")

    perms = {
        "A:read": new_uuid7(),
        "A:update": new_uuid7(),
        "A:create": new_uuid7(),
        "B:read": new_uuid7(),
        "B:update": new_uuid7(),
        "C:read": new_uuid7(),
        "C:update": new_uuid7(),
        "C:create": new_uuid7(),
        "D:read": new_uuid7(),
        "D:update": new_uuid7(),
    }
    for key, perm_id in perms.items():
        _insert_permission(conn, perm_id=perm_id, key=key)

    for key in ("A:read", "B:read", "B:update"):
        _grant(conn, role_id=ids["child_a"], permission_id=perms[key])
    for key in ("A:read", "A:update", "A:create"):
        _grant(conn, role_id=ids["child_b"], permission_id=perms[key])
    _grant(conn, role_id=ids["child_c"], permission_id=perms["D:read"])
    for key in ("D:update", "C:read", "C:update", "C:create"):
        _grant(conn, role_id=ids["parent"], permission_id=perms[key])

    _link_child(conn, parent=ids["child_b"], child=ids["child_c"])
    _link_child(conn, parent=ids["parent"], child=ids["child_a"])
    _link_child(conn, parent=ids["parent"], child=ids["child_b"])
    conn.commit()
    return ids


_PARENT_EFFECTIVE = frozenset(
    {
        "A:read",
        "A:update",
        "A:create",
        "B:read",
        "B:update",
        "C:read",
        "C:update",
        "C:create",
        "D:read",
        "D:update",
    }
)


def test_shared_flatten_sql_matches_auth_copy(repo_root: Path) -> None:
    from untangled.rbac.store import effective_permissions_sql_raw

    backend = (
        repo_root
        / "backend"
        / "src"
        / "untangled"
        / "rbac"
        / "sql"
        / "effective_permissions.sql"
    )
    auth = repo_root / "auth" / "src" / "rbac" / "effective_permissions.sql"
    assert backend.read_bytes() == auth.read_bytes()
    assert effective_permissions_sql_raw() == backend.read_text(encoding="utf-8")
    assert "__P1__" in effective_permissions_sql_raw()
    assert effective_permissions_sql().count("%s") == 2
    assert "__P1__" not in effective_permissions_sql()


def test_nested_union_and_parent_assignment(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    ids = _epic_graph(db_conn)
    user_id = new_uuid7()
    db_conn.execute(
        'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
        "username, password_hash, display_name, is_active, failed_login_count, "
        "password_expires_at) VALUES ("
        "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
        (
            user_id,
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            user_id.hex,
            "x",
            "Comp Parent",
            _NOW,
        ),
    )
    _assign(db_conn, user_id=user_id, role_id=ids["parent"])
    db_conn.commit()
    assert fetch_effective_permission_keys(db_conn, user_id) == _PARENT_EFFECTIVE


def test_directional_child_assignments(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    ids = _epic_graph(db_conn)

    def _user_with(role_key: str) -> UUID:
        user_id = new_uuid7()
        db_conn.execute(
            'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
            "username, password_hash, display_name, is_active, failed_login_count, "
            "password_expires_at) VALUES ("
            "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
            (
                user_id,
                _NOW,
                _NOW,
                SYSTEM_USER_ID,
                SYSTEM_USER_ID,
                user_id.hex,
                "x",
                role_key,
                _NOW,
            ),
        )
        _assign(db_conn, user_id=user_id, role_id=ids[role_key])
        db_conn.commit()
        return user_id

    child_a = fetch_effective_permission_keys(db_conn, _user_with("child_a"))
    assert child_a == frozenset({"A:read", "B:read", "B:update"})
    assert "D:update" not in child_a
    assert "D:read" not in child_a

    child_b = fetch_effective_permission_keys(db_conn, _user_with("child_b"))
    assert child_b == frozenset({"A:read", "A:update", "A:create", "D:read"})
    assert "B:read" not in child_b
    assert "C:read" not in child_b

    child_c = fetch_effective_permission_keys(db_conn, _user_with("child_c"))
    assert child_c == frozenset({"D:read"})


def test_multi_role_union_with_composition(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    ids = _epic_graph(db_conn)
    user_id = new_uuid7()
    db_conn.execute(
        'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
        "username, password_hash, display_name, is_active, failed_login_count, "
        "password_expires_at) VALUES ("
        "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
        (
            user_id,
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            user_id.hex,
            "x",
            "Multi",
            _NOW,
        ),
    )
    _assign(db_conn, user_id=user_id, role_id=ids["child_a"])
    _assign(db_conn, user_id=user_id, role_id=ids["child_c"])
    db_conn.commit()
    assert fetch_effective_permission_keys(db_conn, user_id) == frozenset(
        {"A:read", "B:read", "B:update", "D:read"}
    )


def test_duplicate_child_edge_rejected_by_unique(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    seed_all(db_conn)
    parent = new_uuid7()
    child = new_uuid7()
    _insert_role(db_conn, role_id=parent, name=f"p_{parent.hex[:8]}")
    _insert_role(db_conn, role_id=child, name=f"c_{child.hex[:8]}")
    _link_child(db_conn, parent=parent, child=child)
    db_conn.commit()
    with pytest.raises(errors.UniqueViolation):
        db_conn.execute(
            "INSERT INTO role_child (id, created_at, updated_at, created_by, "
            "updated_by, parent_role_id, child_role_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, parent, child),
        )
    db_conn.rollback()


def test_self_loop_rejected(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    role_id = new_uuid7()
    _insert_role(db_conn, role_id=role_id, name=f"loop_{role_id.hex[:8]}")
    db_conn.commit()
    with pytest.raises(RoleGraphError, match="cycle"):
        assert_role_child_edge_allowed(
            db_conn, parent_role_id=role_id, child_role_id=role_id
        )
    with pytest.raises(errors.CheckViolation):
        db_conn.execute(
            "INSERT INTO role_child (id, created_at, updated_at, created_by, "
            "updated_by, parent_role_id, child_role_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, role_id, role_id),
        )
    db_conn.rollback()


def test_cycle_rejected_on_write(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    a = new_uuid7()
    b = new_uuid7()
    _insert_role(db_conn, role_id=a, name=f"a_{a.hex[:8]}")
    _insert_role(db_conn, role_id=b, name=f"b_{b.hex[:8]}")
    _link_child(db_conn, parent=a, child=b)
    db_conn.commit()
    assert would_create_role_cycle(db_conn, parent_role_id=b, child_role_id=a)
    with pytest.raises(RoleGraphError, match="cycle"):
        assert_role_child_edge_allowed(db_conn, parent_role_id=b, child_role_id=a)


def test_resolve_fails_closed_on_planted_cycle(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    seed_all(db_conn)
    a = new_uuid7()
    b = new_uuid7()
    _insert_role(db_conn, role_id=a, name=f"ca_{a.hex[:8]}")
    _insert_role(db_conn, role_id=b, name=f"cb_{b.hex[:8]}")
    # Bypass write-path checks to plant a cycle (TOCTOU / bad data).
    for parent, child in ((a, b), (b, a)):
        db_conn.execute(
            "INSERT INTO role_child (id, created_at, updated_at, created_by, "
            "updated_by, parent_role_id, child_role_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (new_uuid7(), _NOW, _NOW, SYSTEM_USER_ID, SYSTEM_USER_ID, parent, child),
        )
    user_id = new_uuid7()
    db_conn.execute(
        'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
        "username, password_hash, display_name, is_active, failed_login_count, "
        "password_expires_at) VALUES ("
        "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
        (
            user_id,
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            user_id.hex,
            "x",
            "Cycle",
            _NOW,
        ),
    )
    _assign(db_conn, user_id=user_id, role_id=a)
    db_conn.commit()
    with pytest.raises(RoleGraphError, match="cycle"):
        fetch_effective_permission_keys(db_conn, user_id)


def test_depth_bound_fail_closed_on_resolve(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    seed_all(db_conn)
    roles = [new_uuid7() for _ in range(MAX_ROLE_GRAPH_DEPTH + 1)]
    for i, role_id in enumerate(roles):
        _insert_role(db_conn, role_id=role_id, name=f"d{i}_{role_id.hex[:8]}")
    # Plant a chain one hop past the bound (bypass write-path helpers).
    for i in range(len(roles) - 1):
        db_conn.execute(
            "INSERT INTO role_child (id, created_at, updated_at, created_by, "
            "updated_by, parent_role_id, child_role_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                new_uuid7(),
                _NOW,
                _NOW,
                SYSTEM_USER_ID,
                SYSTEM_USER_ID,
                roles[i],
                roles[i + 1],
            ),
        )
    user_id = new_uuid7()
    db_conn.execute(
        'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
        "username, password_hash, display_name, is_active, failed_login_count, "
        "password_expires_at) VALUES ("
        "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
        (
            user_id,
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            user_id.hex,
            "x",
            "Deep",
            _NOW,
        ),
    )
    _assign(db_conn, user_id=user_id, role_id=roles[0])
    db_conn.commit()
    with pytest.raises(RoleGraphError, match="max depth"):
        fetch_effective_permission_keys(db_conn, user_id)


def test_empty_role_and_diamond(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    empty = new_uuid7()
    left = new_uuid7()
    right = new_uuid7()
    shared = new_uuid7()
    top = new_uuid7()
    for role_id, name in (
        (empty, "empty"),
        (left, "left"),
        (right, "right"),
        (shared, "shared"),
        (top, "top"),
    ):
        _insert_role(db_conn, role_id=role_id, name=f"{name}_{role_id.hex[:8]}")
    perm = new_uuid7()
    _insert_permission(db_conn, perm_id=perm, key="diamond:read")
    _grant(db_conn, role_id=shared, permission_id=perm)
    _link_child(db_conn, parent=left, child=shared)
    _link_child(db_conn, parent=right, child=shared)
    _link_child(db_conn, parent=top, child=left)
    _link_child(db_conn, parent=top, child=right)
    user_empty = new_uuid7()
    user_top = new_uuid7()
    for user_id, label in ((user_empty, "e"), (user_top, "t")):
        db_conn.execute(
            'INSERT INTO "user" (id, created_at, updated_at, created_by, updated_by, '
            "username, password_hash, display_name, is_active, failed_login_count, "
            "password_expires_at) VALUES ("
            "%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s)",
            (
                user_id,
                _NOW,
                _NOW,
                SYSTEM_USER_ID,
                SYSTEM_USER_ID,
                user_id.hex,
                "x",
                label,
                _NOW,
            ),
        )
    _assign(db_conn, user_id=user_empty, role_id=empty)
    _assign(db_conn, user_id=user_top, role_id=top)
    db_conn.commit()
    assert fetch_effective_permission_keys(db_conn, user_empty) == frozenset()
    assert fetch_effective_permission_keys(db_conn, user_top) == frozenset(
        {"diamond:read"}
    )


def test_seed_users_effective_sets_unchanged_with_composition(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    seed_all(db_conn)
    from untangled.rbac.keys import ADMIN_PERMISSION_KEY, class_operation_key

    classes = ("demo_item", "incident", "change_request")
    expected_read = frozenset()
    for c in classes:
        expected_read |= {
            class_operation_key(c, "read"),
            class_operation_key(c, "search"),
        }
    expected_rw = frozenset(expected_read)
    for c in classes:
        expected_rw |= {
            class_operation_key(c, "create"),
            class_operation_key(c, "update"),
        }

    assert fetch_effective_permission_keys(db_conn, SEED_ADMIN_ID) == frozenset(
        {ADMIN_PERMISSION_KEY}
    )
    assert fetch_effective_permission_keys(db_conn, SEED_READONLY_ID) == expected_read
    assert fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID) == expected_rw
    assert fetch_effective_permission_keys(db_conn, SEED_CHANGE_ID) == frozenset(
        {
            class_operation_key("change_request", "create"),
            class_operation_key("change_request", "read"),
            class_operation_key("change_request", "search"),
            class_operation_key("change_request", "update"),
        }
    )
    assert fetch_effective_permission_keys(db_conn, SEED_INCIDENT_ID) == frozenset(
        {
            class_operation_key("incident", "read"),
            class_operation_key("incident", "search"),
        }
    )
    with db_conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT parent_role_id, child_role_id FROM role_child"
        )
        rows = cur.fetchall()
    assert len(rows) == 1


def test_authz_version_bootstrap_does_not_reset(
    demo_schema, db_conn: Connection
) -> None:
    assert demo_schema
    seed_all(db_conn)
    before = fetch_global_authz_version(db_conn)
    db_conn.execute(
        "UPDATE authz_version SET version = version + 5 WHERE id = %s",
        (AUTHZ_VERSION_ID,),
    )
    db_conn.commit()
    bumped = fetch_global_authz_version(db_conn)
    ensure_authz_version_row(db_conn)
    db_conn.commit()
    assert fetch_global_authz_version(db_conn) == bumped
    assert bumped == before + 5


def test_class_level_unique_rejects_unknown_column(tmp_path: Path) -> None:
    from untangled.mapping.definition import DefinitionError, load_definition

    path = tmp_path / "bad.yaml"
    path.write_text(
        "name: bad_join\n"
        "display_name: Bad\n"
        "description: x\n"
        "unique:\n"
        "  - [missing_col]\n"
        "attributes:\n"
        "  role_id:\n"
        "    type: uuid\n"
        "    required: true\n",
        encoding="utf-8",
    )
    with pytest.raises(DefinitionError, match="unknown attribute"):
        load_definition(path)


def test_unknown_user_still_empty(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    seed_all(db_conn)
    assert fetch_effective_permission_keys(db_conn, uuid4()) == frozenset()
