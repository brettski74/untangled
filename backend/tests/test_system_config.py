"""system_config class: bootstrap, HTTP mount, helpers, and cache."""

from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection, sql

from untangled.main import app
from untangled.mapping.definition import load_definition
from untangled.mapping.registry import class_definition
from untangled.mapping.well_known import SYSTEM_CONFIG_ID, SYSTEM_USER_ID
from untangled.records.deps import model
from untangled.schema.migrate import migrate
from untangled.seed.users import SEED_USERS
from untangled.system_config import (
    SYSTEM_CONFIG_DEFAULTS,
    SystemConfigCache,
    SystemConfigUnreadableError,
    ensure_system_config_row,
    get_system_config,
    load_system_config,
)
from untangled.system_config.helpers import clamp_system_config


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _bearer(_client: TestClient, username: str) -> str:
    return bearer_for(username)


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
    defn = load_definition(repo_definitions / "system_config.yaml")
    assert defn.public is True
    assert defn.permissions == ("read", "update")
    assert defn.check_constraints == (
        f"id = '{SYSTEM_CONFIG_ID}'::uuid",
        "password_maximum_chars > password_minimum_chars",
        "login_process_time_minimum <= login_process_time_maximum",
        "session_refresh_reuse_window_seconds > session_refresh_reuse_grace_seconds",
        "session_refresh_process_time_minimum <= session_refresh_process_time_maximum",
    )
    by_name = {a.name_snake: a for a in defn.attributes}
    assert by_name["max_search_nesting_depth"].create_default == 3
    assert by_name["max_search_nesting_length"].create_default == 20
    assert by_name["max_search_nesting_length"].min_value == 1
    assert by_name["max_search_nesting_length"].max_value == 100
    assert by_name["system_config_cache_ttl_seconds"].create_default == 900
    assert by_name["password_minimum_chars"].create_default == 12
    assert by_name["password_maximum_chars"].create_default == 128
    assert by_name["password_acceptable_crack_time_days"].create_default == 1000
    assert by_name["password_guess_per_second"].create_default == 10000
    assert by_name["password_estimate_drift_factor"].create_default == "1.1"
    assert by_name["password_expiry_days"].create_default == 90
    assert by_name["password_expiry_days"].min_value == 3
    assert by_name["password_grace_days"].create_default == 14
    assert by_name["password_grace_days"].min_value == 3
    assert by_name["password_minimum_chars"].max_value == 256
    assert by_name["password_maximum_chars"].max_value == 256
    assert by_name["login_process_time_minimum"].create_default == 300
    assert by_name["login_process_time_minimum"].min_value == 100
    assert by_name["login_process_time_maximum"].create_default == 500
    assert by_name["login_process_time_maximum"].min_value == 200
    assert by_name["login_hash_concurrency_limit"].create_default == 4
    assert by_name["login_hash_concurrency_limit"].min_value == 1
    assert by_name["login_hash_concurrency_limit"].max_value == 10
    assert by_name["login_maximum_failed_count"].create_default == 5
    assert by_name["login_maximum_failed_count"].min_value == 1
    assert by_name["login_rate_limit_per_user_threshold"].create_default == 10
    assert by_name["login_rate_limit_per_user_threshold"].min_value == 1
    assert by_name["login_rate_limit_per_user_sample_period"].create_default == 300
    assert by_name["login_rate_limit_per_ip_threshold"].create_default == 10
    assert by_name["login_rate_limit_per_ip_sample_period"].create_default == 300
    assert by_name["login_rate_limit_l1_delay"].create_default == 500
    assert by_name["login_rate_limit_l1_delay"].min_value == 0
    assert by_name["login_rate_limit_l2_delay"].create_default == 2000
    assert by_name["login_rate_limit_lockout_seconds"].create_default == 900
    assert by_name["login_rate_limit_max_kib"].create_default == 16384
    assert by_name["login_rate_limit_max_kib"].min_value == 8192
    assert by_name["login_rate_limit_max_kib"].max_value == 262144
    assert by_name["session_access_ttl_seconds"].create_default == 900
    assert by_name["session_access_ttl_seconds"].min_value == 60
    assert by_name["session_access_ttl_seconds"].max_value == 86400
    assert by_name["session_refresh_ttl_seconds"].create_default == 604800
    assert by_name["session_refresh_ttl_seconds"].min_value == 300
    assert by_name["session_refresh_ttl_seconds"].max_value == 7776000
    assert by_name["session_total_ttl_seconds"].create_default == 2592000
    assert by_name["session_total_ttl_seconds"].min_value == 300
    assert by_name["session_total_ttl_seconds"].max_value == 15552000
    assert by_name["session_refresh_reuse_grace_seconds"].create_default == 15
    assert by_name["session_refresh_reuse_grace_seconds"].min_value == 5
    assert by_name["session_refresh_reuse_grace_seconds"].max_value == 60
    assert by_name["session_refresh_reuse_window_seconds"].create_default == 86400
    assert by_name["session_refresh_reuse_window_seconds"].min_value == 3600
    assert by_name["session_refresh_reuse_window_seconds"].max_value == 604800
    assert by_name["session_max_refresh_retries"].create_default == 5
    assert by_name["session_max_refresh_retries"].min_value == 1
    assert by_name["session_max_refresh_retries"].max_value == 10
    assert by_name["session_refresh_cleanup_seconds"].create_default == 14400
    assert by_name["session_refresh_cleanup_seconds"].min_value == 3600
    assert by_name["session_refresh_cleanup_seconds"].max_value == 259200
    assert by_name["session_refresh_process_time_minimum"].create_default == 300
    assert by_name["session_refresh_process_time_minimum"].min_value == 100
    assert by_name["session_refresh_process_time_minimum"].max_value == 500
    assert by_name["session_refresh_process_time_maximum"].create_default == 500
    assert by_name["session_refresh_process_time_maximum"].min_value == 200
    assert by_name["session_refresh_process_time_maximum"].max_value == 1000


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
            system_config_cache_ttl_seconds,
            password_minimum_chars,
            password_maximum_chars,
            password_acceptable_crack_time_days,
            password_guess_per_second,
            password_estimate_drift_factor,
            password_expiry_days,
            password_grace_days,
            login_process_time_minimum,
            login_process_time_maximum,
            login_hash_concurrency_limit,
            login_maximum_failed_count,
            login_rate_limit_per_user_threshold,
            login_rate_limit_per_user_sample_period,
            login_rate_limit_per_ip_threshold,
            login_rate_limit_per_ip_sample_period,
            login_rate_limit_l1_delay,
            login_rate_limit_l2_delay,
            login_rate_limit_lockout_seconds,
            login_rate_limit_max_kib,
            session_access_ttl_seconds,
            session_refresh_ttl_seconds,
            session_total_ttl_seconds,
            session_refresh_reuse_grace_seconds,
            session_refresh_reuse_window_seconds,
            session_max_refresh_retries,
            session_refresh_cleanup_seconds,
            session_refresh_process_time_minimum,
            session_refresh_process_time_maximum
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
        pw_min,
        pw_max,
        crack_days,
        guesses,
        drift,
        pw_expiry,
        pw_grace,
        login_min,
        login_max,
        hash_limit,
        max_failed,
        rl_user_th,
        rl_user_s,
        rl_ip_th,
        rl_ip_s,
        rl_d1,
        rl_d2,
        rl_l,
        rl_max_kib,
        session_access,
        session_refresh,
        session_total,
        session_grace,
        session_window,
        session_retries,
        session_cleanup,
        session_proc_min,
        session_proc_max,
    ) = row
    assert row_id == SYSTEM_CONFIG_ID
    assert created_by == SYSTEM_USER_ID
    assert updated_by == SYSTEM_USER_ID
    assert depth == SYSTEM_CONFIG_DEFAULTS["max_search_nesting_depth"]
    assert length == SYSTEM_CONFIG_DEFAULTS["max_search_nesting_length"]
    assert predicates == SYSTEM_CONFIG_DEFAULTS["max_search_total_predicates"]
    assert regexp == SYSTEM_CONFIG_DEFAULTS["max_search_total_regexp"]
    assert ttl == SYSTEM_CONFIG_DEFAULTS["system_config_cache_ttl_seconds"]
    assert pw_min == SYSTEM_CONFIG_DEFAULTS["password_minimum_chars"]
    assert pw_max == SYSTEM_CONFIG_DEFAULTS["password_maximum_chars"]
    assert crack_days == SYSTEM_CONFIG_DEFAULTS["password_acceptable_crack_time_days"]
    assert guesses == SYSTEM_CONFIG_DEFAULTS["password_guess_per_second"]
    assert drift == SYSTEM_CONFIG_DEFAULTS["password_estimate_drift_factor"]
    assert pw_expiry == SYSTEM_CONFIG_DEFAULTS["password_expiry_days"]
    assert pw_grace == SYSTEM_CONFIG_DEFAULTS["password_grace_days"]
    assert login_min == SYSTEM_CONFIG_DEFAULTS["login_process_time_minimum"]
    assert login_max == SYSTEM_CONFIG_DEFAULTS["login_process_time_maximum"]
    assert hash_limit == SYSTEM_CONFIG_DEFAULTS["login_hash_concurrency_limit"]
    assert max_failed == SYSTEM_CONFIG_DEFAULTS["login_maximum_failed_count"]
    assert rl_user_th == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_per_user_threshold"]
    assert rl_user_s == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_per_user_sample_period"]
    assert rl_ip_th == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_per_ip_threshold"]
    assert rl_ip_s == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_per_ip_sample_period"]
    assert rl_d1 == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_l1_delay"]
    assert rl_d2 == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_l2_delay"]
    assert rl_l == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_lockout_seconds"]
    assert rl_max_kib == SYSTEM_CONFIG_DEFAULTS["login_rate_limit_max_kib"]
    assert session_access == SYSTEM_CONFIG_DEFAULTS["session_access_ttl_seconds"]
    assert session_refresh == SYSTEM_CONFIG_DEFAULTS["session_refresh_ttl_seconds"]
    assert session_total == SYSTEM_CONFIG_DEFAULTS["session_total_ttl_seconds"]
    assert session_grace == SYSTEM_CONFIG_DEFAULTS["session_refresh_reuse_grace_seconds"]
    assert session_window == SYSTEM_CONFIG_DEFAULTS["session_refresh_reuse_window_seconds"]
    assert session_retries == SYSTEM_CONFIG_DEFAULTS["session_max_refresh_retries"]
    assert session_cleanup == SYSTEM_CONFIG_DEFAULTS["session_refresh_cleanup_seconds"]
    assert session_proc_min == SYSTEM_CONFIG_DEFAULTS["session_refresh_process_time_minimum"]
    assert session_proc_max == SYSTEM_CONFIG_DEFAULTS["session_refresh_process_time_maximum"]

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

    max_gt_min = db_conn.execute(
        """
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'system_config'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%password_maximum_chars%'
          AND pg_get_constraintdef(oid) ILIKE '%password_minimum_chars%'
        """
    ).fetchone()
    assert max_gt_min is not None


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
    assert any("ensure system_config singleton" in m for m in messages)

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
    from datetime import datetime, timezone

    from untangled.persistence.ids import new_uuid7

    now = datetime.now(timezone.utc)
    other_id = new_uuid7()
    with pytest.raises(Exception):
        db_conn.execute(
            """
            INSERT INTO system_config (
                id, created_at, updated_at, created_by, updated_by,
                max_search_nesting_depth, max_search_nesting_length,
                max_search_total_predicates, max_search_total_regexp,
                system_config_cache_ttl_seconds,
                password_minimum_chars, password_maximum_chars,
                password_acceptable_crack_time_days, password_guess_per_second,
                password_estimate_drift_factor,
                login_process_time_minimum, login_process_time_maximum,
                login_hash_concurrency_limit, login_maximum_failed_count,
                login_rate_limit_per_user_threshold,
                login_rate_limit_per_user_sample_period,
                login_rate_limit_per_ip_threshold,
                login_rate_limit_per_ip_sample_period,
                login_rate_limit_l1_delay, login_rate_limit_l2_delay,
                login_rate_limit_lockout_seconds, login_rate_limit_max_kib,
                audit_bulk_read_window_seconds, audit_bulk_read_max_searches,
                session_access_ttl_seconds, session_refresh_ttl_seconds,
                session_total_ttl_seconds,
                session_refresh_reuse_grace_seconds,
                session_refresh_reuse_window_seconds,
                session_max_refresh_retries, session_refresh_cleanup_seconds,
                session_refresh_process_time_minimum,
                session_refresh_process_time_maximum
            ) VALUES (
                %s, %s, %s, %s, %s, 3, 20, 50, 3, 900, 12, 128, 1000, 10000, 1.1,
                300, 500, 4, 5, 10, 300, 10, 300, 500, 2000, 900, 16384, 600, 100,
                900, 604800, 2592000, 15, 86400, 5, 14400, 300, 500
            )
            """,
            (other_id, now, now, SYSTEM_USER_ID, SYSTEM_USER_ID),
        )
        db_conn.commit()
    db_conn.rollback()


def test_check_constraint_rejects_password_max_not_greater_than_min(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    with pytest.raises(Exception):
        db_conn.execute(
            """
            UPDATE system_config
            SET password_minimum_chars = 20, password_maximum_chars = 20
            WHERE id = %s
            """,
            (SYSTEM_CONFIG_ID,),
        )
        db_conn.commit()
    db_conn.rollback()


def test_check_constraint_rejects_login_process_min_greater_than_max(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    with pytest.raises(Exception):
        db_conn.execute(
            """
            UPDATE system_config
            SET login_process_time_minimum = 500, login_process_time_maximum = 200
            WHERE id = %s
            """,
            (SYSTEM_CONFIG_ID,),
        )
        db_conn.commit()
    db_conn.rollback()


def test_check_constraint_rejects_session_reuse_window_not_greater_than_grace(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    with pytest.raises(Exception):
        db_conn.execute(
            """
            UPDATE system_config
            SET session_refresh_reuse_window_seconds = 15,
                session_refresh_reuse_grace_seconds = 15
            WHERE id = %s
            """,
            (SYSTEM_CONFIG_ID,),
        )
        db_conn.commit()
    db_conn.rollback()


def test_check_constraint_rejects_session_process_min_greater_than_max(
    demo_schema,
    db_conn: Connection,
) -> None:
    assert demo_schema
    with pytest.raises(Exception):
        db_conn.execute(
            """
            UPDATE system_config
            SET session_refresh_process_time_minimum = 400,
                session_refresh_process_time_maximum = 200
            WHERE id = %s
            """,
            (SYSTEM_CONFIG_ID,),
        )
        db_conn.commit()
    db_conn.rollback()


def test_authenticated_fetch_without_read_permission(
    tickets_client: TestClient,
) -> None:
    headers = _headers(tickets_client, "readonly")
    response = tickets_client.get(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(SYSTEM_CONFIG_ID)
    assert response.json()["max_search_nesting_length"] == 20


def test_unauthenticated_fetch_is_401(tickets_client: TestClient) -> None:
    assert (
        tickets_client.get(f"/api/v2/system_config/{SYSTEM_CONFIG_ID}").status_code
        == 401
    )


def test_update_requires_admin_among_seed_roles(tickets_client: TestClient) -> None:
    readonly = _headers(tickets_client, "readonly")
    denied = tickets_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=readonly,
        json={"max_search_nesting_depth": 4},
    )
    assert denied.status_code == 403

    admin_seed = next(s for s in SEED_USERS if s.username == "admin")
    admin = _headers(tickets_client, "admin")
    updated = tickets_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=admin,
        json={"max_search_nesting_depth": 4},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["max_search_nesting_depth"] == 4
    created = body["created_by"]
    assert isinstance(created, dict)
    assert created["id"] == str(SYSTEM_USER_ID)
    assert created["display_name"] == "System"
    updated_by = body["updated_by"]
    assert isinstance(updated_by, dict)
    assert updated_by["id"] == str(admin_seed.id)
    assert updated_by["display_name"] == admin_seed.display_name


def test_update_publishes_coherence_invalidate(
    tickets_client: TestClient,
) -> None:
    """Successful system-config write publishes the coherence flush topic."""
    from collections.abc import Mapping
    from typing import Any

    from untangled.coherence.system_config import set_default_bus_for_tests
    from untangled.coherence.topics import (
        SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
        SYSTEM_CONFIG_INVALIDATE_TOPIC,
    )

    published: list[tuple[str, dict[str, Any]]] = []

    class CaptureBus:
        def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
            published.append((topic, dict(payload)))

        def subscribe(self, topic: str, handler):  # noqa: ANN001
            raise AssertionError("unused")

    set_default_bus_for_tests(CaptureBus())
    try:
        admin = _headers(tickets_client, "admin")
        updated = tickets_client.patch(
            f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
            headers=admin,
            json={"max_search_nesting_depth": 6},
        )
        assert updated.status_code == 200
        assert published == [
            (SYSTEM_CONFIG_INVALIDATE_TOPIC, SYSTEM_CONFIG_INVALIDATE_PAYLOAD)
        ]
    finally:
        set_default_bus_for_tests(None)


def test_create_delete_search_routes_absent(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    assert tickets_client.post(
        "/api/v2/system_config", headers=headers, json={}
    ).status_code in {
        404,
        405,
    }
    assert tickets_client.post(
        "/api/v2/system_config/search",
        headers=headers,
        json={
            "predicate": {
                "op": "eq",
                "attribute": "id",
                "value": str(SYSTEM_CONFIG_ID),
            }
        },
    ).status_code in {404, 405}
    assert tickets_client.delete(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=headers,
    ).status_code in {404, 405}


def test_update_rejects_out_of_range(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "admin")
    response = tickets_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=headers,
        json={"max_search_nesting_depth": 99},
    )
    assert response.status_code in {400, 422}


def test_update_password_max_not_greater_than_min_is_422_not_500(
    tickets_client: TestClient,
) -> None:
    """CHECK on password bounds → semantic 422 with primary text, no row dump."""
    headers = _headers(tickets_client, "admin")
    response = tickets_client.patch(
        f"/api/v2/system_config/{SYSTEM_CONFIG_ID}",
        headers=headers,
        json={
            "password_minimum_chars": 20,
            "password_maximum_chars": 20,
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert isinstance(body.get("detail"), str)
    detail = body["detail"]
    assert "check constraint" in detail.lower()
    assert "system_config_check" in detail
    assert "Failing row contains" not in detail
    assert "Failing row contains" not in response.text
    # Spot-check: full-row DETAIL must not leak into the body.
    assert str(SYSTEM_CONFIG_ID) not in detail


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
            system_config_cache_ttl_seconds = 0,
            password_minimum_chars = 0,
            password_guess_per_second = 50,
            password_estimate_drift_factor = 99
        WHERE id = %s
        """,
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()

    row = load_system_config(db_conn)
    assert row.max_search_nesting_depth == 10
    assert row.system_config_cache_ttl_seconds == 1
    assert row.password_minimum_chars == 1
    assert row.password_guess_per_second == 100
    assert row.password_estimate_drift_factor == Decimal("10")

    # HTTP fetch returns stored values as-is (no clamp).
    with TestClient(app) as client:
        headers = _headers(client, "readonly")
        raw = client.get(f"/api/v2/system_config/{SYSTEM_CONFIG_ID}", headers=headers)
        assert raw.status_code == 200
        assert raw.json()["max_search_nesting_depth"] == 99
        assert raw.json()["system_config_cache_ttl_seconds"] == 0
        assert raw.json()["password_minimum_chars"] == 0
        assert float(raw.json()["password_estimate_drift_factor"]) == 99.0


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
    defn = class_definition("system_config")
    model_cls = model("system_config")
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
            "password_minimum_chars": 12,
            "password_maximum_chars": 128,
            "password_acceptable_crack_time_days": 1000,
            "password_guess_per_second": 10000,
            "password_estimate_drift_factor": "1.1",
            "password_expiry_days": 90,
            "password_grace_days": 14,
            "login_process_time_minimum": 300,
            "login_process_time_maximum": 500,
            "login_hash_concurrency_limit": 4,
            "login_maximum_failed_count": 5,
            "login_rate_limit_per_user_threshold": 10,
            "login_rate_limit_per_user_sample_period": 300,
            "login_rate_limit_per_ip_threshold": 10,
            "login_rate_limit_per_ip_sample_period": 300,
            "login_rate_limit_l1_delay": 500,
            "login_rate_limit_l2_delay": 2000,
            "login_rate_limit_lockout_seconds": 900,
            "login_rate_limit_max_kib": 16384,
            "audit_bulk_read_window_seconds": 600,
            "audit_bulk_read_max_searches": 100,
            "session_access_ttl_seconds": 900,
            "session_refresh_ttl_seconds": 604800,
            "session_total_ttl_seconds": 2592000,
            "session_refresh_reuse_grace_seconds": 15,
            "session_refresh_reuse_window_seconds": 86400,
            "session_max_refresh_retries": 5,
            "session_refresh_cleanup_seconds": 14400,
            "session_refresh_process_time_minimum": 300,
            "session_refresh_process_time_maximum": 500,
        }
    )
    clamped = clamp_system_config(raw, defn)
    assert clamped.max_search_nesting_depth == 10
    assert clamped.max_search_nesting_length == 1
