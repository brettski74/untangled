"""system-config class: bootstrap, HTTP mount, helpers, and cache."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection, sql

from untangled.main import app
from untangled.mapping.definition import load_definition
from untangled.mapping.well_known import SYSTEM_CONFIG_ID, SYSTEM_USER_ID
from untangled.schema.migrate import migrate
from untangled.seed.users import SEED_USERS, password_for
from untangled.system_config import (
    SYSTEM_CONFIG_DEFAULTS,
    SystemConfigCache,
    SystemConfigUnreadableError,
    ensure_system_config_row,
    get_system_config,
    load_system_config,
)
from untangled.mapping.registry import class_definition
from untangled.records.deps import model
from untangled.system_config.helpers import clamp_system_config


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _login(client: TestClient, username: str, password: str):
    return client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def _bearer(client: TestClient, username: str) -> str:
    seed = next(s for s in SEED_USERS if s.username == username)
    login = _login(client, seed.username, password_for(seed))
    assert login.status_code == 200
    return login.json()["access_token"]


def _headers(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def _drop_managed(conn: Connection, repo_definitions: Path) -> None:
    from untangled.schema import desired_schema_from_definitions

    desired = desired_schema_from_definitions(repo_definitions)
    for name in sorted(t.name for t in desired.tables):
        conn.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(name)))
    for name in sorted(s.name for s in desired.sequences):
        conn.execute(sql.SQL("DROP SEQUENCE IF EXISTS {}").format(sql.Identifier(name)))
    conn.execute("DROP TABLE IF EXISTS schema_version_class_hashes CASCADE")
    conn.execute("DROP TABLE IF EXISTS schema_versions CASCADE")
    conn.commit()


def test_system_config_definition_flags(repo_definitions: Path) -> None:
    defn = load_definition(repo_definitions / "system-config.yaml")
    assert defn.public is True
    assert defn.suppress_create is True
    assert defn.suppress_delete is True
    assert defn.suppress_search is True
    assert defn.check_constraints == (f"id = '{SYSTEM_CONFIG_ID}'::uuid",)
    by_name = {a.name_kebab: a for a in defn.attributes}
    assert by_name["max-search-nesting-depth"].create_default == 3
    assert by_name["max-search-nesting-length"].create_default == 20
    assert by_name["max-search-nesting-length"].min_value == 1
    assert by_name["max-search-nesting-length"].max_value == 100
    assert by_name["system-config-cache-ttl-seconds"].create_default == 900


def test_migrate_bootstraps_system_config_singleton(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    result = migrate(db_conn, repo_definitions)
    assert result.applied

    row = db_conn.execute(
        """
        SELECT
            id, created_by, updated_by,
            max_search_nesting_depth,
            max_search_nesting_length,
            max_search_total_predicates,
            max_search_total_regexp,
            system_config_cache_ttl_seconds
        FROM system_config
        WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    ).fetchone()
    assert row is not None
    (
        row_id,
        created_by,
        updated_by,
        depth,
        length,
        predicates,
        regexp,
        ttl,
    ) = row
    assert row_id == SYSTEM_CONFIG_ID
    assert created_by == SYSTEM_USER_ID
    assert updated_by == SYSTEM_USER_ID
    assert depth == SYSTEM_CONFIG_DEFAULTS["max_search_nesting_depth"]
    assert length == SYSTEM_CONFIG_DEFAULTS["max_search_nesting_length"]
    assert predicates == SYSTEM_CONFIG_DEFAULTS["max_search_total_predicates"]
    assert regexp == SYSTEM_CONFIG_DEFAULTS["max_search_total_regexp"]
    assert ttl == SYSTEM_CONFIG_DEFAULTS["system_config_cache_ttl_seconds"]

    check = db_conn.execute(
        """
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'system_config'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE %s
        """,
        (f"%{SYSTEM_CONFIG_ID}%",),
    ).fetchone()
    assert check is not None


def test_migrate_does_not_clobber_system_config_updates(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    migrate(db_conn, repo_definitions)
    db_conn.execute(
        """
        UPDATE system_config
        SET max_search_nesting_length = 42
        WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()

    messages: list[str] = []
    second = migrate(db_conn, repo_definitions, progress=messages.append)
    assert second.applied is False
    assert any("ensure system-config singleton" in m for m in messages)

    length = db_conn.execute(
        "SELECT max_search_nesting_length FROM system_config WHERE id = %s",
        (SYSTEM_CONFIG_ID,),
    ).fetchone()[0]
    assert length == 42


def test_check_constraint_rejects_extra_system_config_id(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    from untangled.persistence.ids import new_uuid7
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    other_id = new_uuid7()
    with pytest.raises(Exception):
        db_conn.execute(
            """
            INSERT INTO system_config (
                id, created_at, updated_at, created_by, updated_by,
                max_search_nesting_depth, max_search_nesting_length,
                max_search_total_predicates, max_search_total_regexp,
                system_config_cache_ttl_seconds
            ) VALUES (
                %s, %s, %s, %s, %s, 3, 20, 50, 3, 900
            )
            """,
            (other_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID),
        )
        db_conn.commit()
    db_conn.rollback()


def test_authenticated_fetch_without_read_permission(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "readonly")
    legacy = tickets_client.get(f"/system-configs/{SYSTEM_CONFIG_ID}", headers=headers)
    assert legacy.status_code == 200
    assert legacy.json()["id"] == str(SYSTEM_CONFIG_ID)
    assert legacy.json()["max_search_nesting_length"] == 20

    v1 = tickets_client.get(
        f"/api/v1/system-configs/{SYSTEM_CONFIG_ID}",
        headers=headers,
    )
    assert v1.status_code == 200
    assert v1.json()["id"] == str(SYSTEM_CONFIG_ID)


def test_unauthenticated_fetch_is_401(tickets_client: TestClient) -> None:
    assert (
        tickets_client.get(f"/system-configs/{SYSTEM_CONFIG_ID}").status_code == 401
    )
    assert (
        tickets_client.get(
            f"/api/v1/system-configs/{SYSTEM_CONFIG_ID}"
        ).status_code
        == 401
    )


def test_update_requires_admin_among_seed_roles(tickets_client: TestClient) -> None:
    readonly = _headers(tickets_client, "readonly")
    denied = tickets_client.patch(
        f"/system-configs/{SYSTEM_CONFIG_ID}",
        headers=readonly,
        json={"max_search_nesting_depth": 4},
    )
    assert denied.status_code == 403

    admin = _headers(tickets_client, "admin")
    updated = tickets_client.patch(
        f"/system-configs/{SYSTEM_CONFIG_ID}",
        headers=admin,
        json={"max_search_nesting_depth": 4},
    )
    assert updated.status_code == 200
    assert updated.json()["max_search_nesting_depth"] == 4


def test_create_delete_search_routes_absent(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    assert tickets_client.post("/system-configs", headers=headers, json={}).status_code in {
        404,
        405,
    }
    assert tickets_client.post(
        "/system-configs/search",
        headers=headers,
        json={"predicate": {"op": "eq", "attribute": "id", "value": str(SYSTEM_CONFIG_ID)}},
    ).status_code in {404, 405}
    assert tickets_client.delete(
        f"/system-configs/{SYSTEM_CONFIG_ID}",
        headers=headers,
    ).status_code in {404, 405}
    assert tickets_client.post(
        "/api/v1/system-configs/search",
        headers=headers,
        json={"predicate": {"op": "eq", "attribute": "id", "value": str(SYSTEM_CONFIG_ID)}},
    ).status_code in {404, 405}
    assert tickets_client.patch(
        f"/api/v1/system-configs/{SYSTEM_CONFIG_ID}",
        headers=headers,
        json={"max_search_nesting_depth": 5},
    ).status_code in {404, 405}


def test_update_rejects_out_of_range(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.patch(
        f"/system-configs/{SYSTEM_CONFIG_ID}",
        headers=headers,
        json={"max_search_nesting_depth": 99},
    )
    assert response.status_code in {400, 422}


def test_helpers_fail_closed_when_missing(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    migrate(db_conn, repo_definitions)
    db_conn.execute("DELETE FROM system_config WHERE id = %s", (SYSTEM_CONFIG_ID,))
    db_conn.commit()
    with pytest.raises(SystemConfigUnreadableError):
        load_system_config(db_conn)


def test_helpers_clamp_out_of_range(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    db_conn.execute(
        """
        UPDATE system_config
        SET max_search_nesting_depth = 99,
            system_config_cache_ttl_seconds = 0
        WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()

    row = load_system_config(db_conn)
    assert row.max_search_nesting_depth == 10
    assert row.system_config_cache_ttl_seconds == 1

    # HTTP fetch returns stored values as-is (no clamp).
    with TestClient(app) as client:
        headers = _headers(client, "readonly")
        raw = client.get(f"/system-configs/{SYSTEM_CONFIG_ID}", headers=headers)
        assert raw.status_code == 200
        assert raw.json()["max_search_nesting_depth"] == 99
        assert raw.json()["system_config_cache_ttl_seconds"] == 0


def test_cache_ttl_and_invalidate(
    demo_schema,
    db_conn: Connection,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert demo_schema
    cache = SystemConfigCache()
    first = get_system_config(db_conn, cache=cache)
    assert first.max_search_nesting_length == 20

    db_conn.execute(
        """
        UPDATE system_config SET max_search_nesting_length = 33 WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()

    # Still within TTL — stale cached value.
    assert get_system_config(db_conn, cache=cache).max_search_nesting_length == 20

    cache.invalidate()
    assert get_system_config(db_conn, cache=cache).max_search_nesting_length == 33

    db_conn.execute(
        """
        UPDATE system_config SET max_search_nesting_length = 44 WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()

    # Expire by advancing monotonic clock past TTL.
    entry = cache._entry
    assert entry is not None
    monkeypatch.setattr(
        "untangled.system_config.cache.time.monotonic",
        lambda: entry.expires_at + 1,
    )
    assert get_system_config(db_conn, cache=cache).max_search_nesting_length == 44


def test_ensure_system_config_row_idempotent(demo_schema, db_conn: Connection) -> None:
    assert demo_schema
    ensure_system_config_row(db_conn)
    db_conn.commit()
    count = db_conn.execute("SELECT COUNT(*) FROM system_config").fetchone()[0]
    assert count == 1


def test_clamp_uses_definition_bounds() -> None:
    defn = class_definition("system-config")
    model_cls = model("system-config")
    raw = model_cls.model_validate(
        {
            "id": SYSTEM_CONFIG_ID,
            "created_at": "2020-01-01T00:00:00Z",
            "updated_at": "2020-01-01T00:00:00Z",
            "created_by": SYSTEM_USER_ID,
            "updated_by": SYSTEM_USER_ID,
            "max_search_nesting_depth": 99,
            "max_search_nesting_length": 0,
            "max_search_total_predicates": 50,
            "max_search_total_regexp": 3,
            "system_config_cache_ttl_seconds": 900,
        }
    )
    clamped = clamp_system_config(raw, defn)
    assert clamped.max_search_nesting_depth == 10
    assert clamped.max_search_nesting_length == 1
