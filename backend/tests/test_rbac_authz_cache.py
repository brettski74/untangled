"""Redis authz permission cache: version tags, invalidation, safe fallback."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from psycopg import Connection
from redis import Redis

from untangled.mapping.well_known import SYSTEM_USER_ID
from untangled.persistence.ids import new_uuid7
from untangled.rbac.cache import (
    AUTHZ_USER_KEY_PREFIX,
    authz_user_redis_key,
    fetch_effective_permission_keys_cached,
    invalidate_user_authz_cache,
    set_authz_command_client,
)
from untangled.rbac.keys import class_operation_key, permission_id_for_key
from untangled.rbac.store import (
    bump_global_authz_version,
    fetch_effective_permission_keys,
    fetch_global_authz_version,
)
from untangled.redis import create_command_client, create_subscriber_client
from untangled.seed import seed_all
from untangled.seed.users import SEED_READWRITE_ID

_NOW = datetime.now(timezone.utc)


@pytest.fixture
def authz_redis(monkeypatch: pytest.MonkeyPatch) -> Redis:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://localhost:6379/0")
    client = create_command_client()
    set_authz_command_client(client)
    # Clear any leftover authz keys from prior runs.
    for key in client.scan_iter(match=f"{AUTHZ_USER_KEY_PREFIX}*"):
        client.delete(key)
    try:
        yield client
    finally:
        for key in client.scan_iter(match=f"{AUTHZ_USER_KEY_PREFIX}*"):
            client.delete(key)
        set_authz_command_client(None)
        client.close()


def test_command_client_not_subscriber_for_authz(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://localhost:6379/0")
    command = create_command_client()
    subscriber = create_subscriber_client()
    try:
        assert command.connection_pool is not subscriber.connection_pool
    finally:
        command.close()
        subscriber.close()


def test_version_match_hit(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    keys1 = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    raw = authz_redis.get(authz_user_redis_key(SEED_READWRITE_ID))
    assert raw is not None
    keys2 = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    assert keys1 == keys2
    assert keys1 == fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID)


def test_version_mismatch_reloads(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    before = fetch_global_authz_version(db_conn)
    # Grant an extra permission on read_write and bump version.
    perm_key = class_operation_key("demo_item", "delete")
    db_conn.execute(
        "INSERT INTO role_permission (id, created_at, updated_at, created_by, "
        "updated_by, role_id, permission_id) "
        "SELECT %s, %s, %s, %s, %s, r.id, %s FROM role r WHERE r.name = 'read_write'",
        (
            new_uuid7(),
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            permission_id_for_key(perm_key),
        ),
    )
    after = bump_global_authz_version(db_conn)
    db_conn.commit()
    assert after == before + 1
    keys = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    assert perm_key in keys


def test_user_role_bump_invalidates_without_redis_delete(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    before = fetch_global_authz_version(db_conn)
    # Attach incident_read_only without clearing Redis (correctness = version bump).
    incident_role = db_conn.execute(
        "SELECT id FROM role WHERE name = 'incident_read_only'"
    ).fetchone()[0]
    db_conn.execute(
        "INSERT INTO user_role (id, created_at, updated_at, created_by, updated_by, "
        "user_id, role_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (
            new_uuid7(),
            _NOW,
            _NOW,
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
            SEED_READWRITE_ID,
            incident_role,
        ),
    )
    bump_global_authz_version(db_conn)
    db_conn.commit()
    assert fetch_global_authz_version(db_conn) == before + 1
    # Stale Redis entry still has old version tag → must reload.
    keys = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    assert class_operation_key("incident", "read") in keys


def test_optional_per_user_invalidate_fast_path(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    assert authz_redis.exists(authz_user_redis_key(SEED_READWRITE_ID)) == 1
    invalidate_user_authz_cache(SEED_READWRITE_ID)
    assert authz_redis.exists(authz_user_redis_key(SEED_READWRITE_ID)) == 0


def test_redis_flush_reloads_from_postgres(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    version = fetch_global_authz_version(db_conn)
    fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    for key in authz_redis.scan_iter(match=f"{AUTHZ_USER_KEY_PREFIX}*"):
        authz_redis.delete(key)
    keys = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    assert keys == fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID)
    assert fetch_global_authz_version(db_conn) == version


def test_redis_error_falls_back_to_db(
    demo_schema, db_conn: Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert demo_schema
    seed_all(db_conn)

    class _Boom:
        def get(self, *_args, **_kwargs):
            raise RuntimeError("redis down")

        def set(self, *_args, **_kwargs):
            raise RuntimeError("redis down")

    keys = fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=_Boom()  # type: ignore[arg-type]
    )
    assert keys == fetch_effective_permission_keys(db_conn, SEED_READWRITE_ID)


def test_cache_payload_has_no_secrets(
    demo_schema, db_conn: Connection, authz_redis: Redis
) -> None:
    assert demo_schema
    seed_all(db_conn)
    fetch_effective_permission_keys_cached(
        db_conn, SEED_READWRITE_ID, redis_client=authz_redis
    )
    raw = authz_redis.get(authz_user_redis_key(SEED_READWRITE_ID))
    assert raw is not None
    assert "password" not in raw.lower()
    assert "token" not in raw.lower()
    assert raw.startswith("{")
    assert '"v":' in raw
    assert '"keys":' in raw


def test_key_prefix_isolated_from_coherence_and_rate_limit() -> None:
    assert AUTHZ_USER_KEY_PREFIX.startswith("untangled.authz.")
    assert not AUTHZ_USER_KEY_PREFIX.startswith("untangled.coherence.")
    assert not AUTHZ_USER_KEY_PREFIX.startswith("auth:rl:")
