"""Redis-backed cache of flattened per-user permission key sets.

Cache compares always read the Postgres ``authz_version`` singleton. Redis holds
only per-user entries under ``untangled.authz.user:{user_id}``. Missing Redis is
never treated as version 0. Command traffic uses ``create_command_client`` — never
a pub/sub subscriber connection.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from psycopg import Connection
from redis import Redis

from untangled.rbac.store import (
    fetch_effective_permission_keys,
    fetch_global_authz_version,
)
from untangled.redis import create_command_client

_LOG = logging.getLogger(__name__)

AUTHZ_USER_KEY_PREFIX = "untangled.authz.user:"
# Defense-in-depth TTL; version compare remains authoritative.
AUTHZ_CACHE_TTL_SECONDS = 60

_command_client: Redis | None = None


def authz_user_redis_key(user_id: UUID | str) -> str:
    return f"{AUTHZ_USER_KEY_PREFIX}{user_id}"


def get_authz_command_client() -> Redis:
    """Return a process-wide Redis command client for authz cache traffic."""
    global _command_client
    if _command_client is None:
        _command_client = create_command_client()
    return _command_client


def set_authz_command_client(client: Redis | None) -> None:
    """Override the command client (tests). Pass ``None`` to clear."""
    global _command_client
    _command_client = client


def invalidate_user_authz_cache(user_id: UUID | str) -> None:
    """Best-effort delete of one user's cached permissions (optional fast path)."""
    try:
        get_authz_command_client().delete(authz_user_redis_key(user_id))
    except Exception:
        _LOG.exception(
            "failed to invalidate authz cache for user %s; relying on version bump",
            user_id,
        )


def fetch_effective_permission_keys_cached(
    conn: Connection,
    user_id: UUID,
    *,
    redis_client: Redis | None = None,
) -> frozenset[str]:
    """Resolve effective keys via Redis when the version tag matches Postgres."""
    global_version = fetch_global_authz_version(conn)
    client = redis_client if redis_client is not None else get_authz_command_client()
    key = authz_user_redis_key(user_id)

    cached = _read_cache_entry(client, key)
    if cached is not None and cached.get("v") == global_version:
        keys = cached.get("keys")
        if isinstance(keys, list) and all(isinstance(k, str) for k in keys):
            return frozenset(keys)

    resolved = fetch_effective_permission_keys(conn, user_id)
    _write_cache_entry(client, key, version=global_version, keys=resolved)
    return resolved


def _read_cache_entry(client: Redis, key: str) -> dict[str, Any] | None:
    try:
        raw = client.get(key)
    except Exception:
        _LOG.exception("authz cache GET failed for %s; falling back to database", key)
        return None
    if raw is None:
        return None
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        _LOG.warning("authz cache entry %s is not valid JSON; ignoring", key)
        return None
    if not isinstance(payload, dict):
        _LOG.warning("authz cache entry %s is not an object; ignoring", key)
        return None
    return payload


def _write_cache_entry(
    client: Redis,
    key: str,
    *,
    version: int,
    keys: frozenset[str],
) -> None:
    payload = json.dumps(
        {"v": version, "keys": sorted(keys)},
        separators=(",", ":"),
    )
    try:
        client.set(key, payload, ex=AUTHZ_CACHE_TTL_SECONDS)
    except Exception:
        _LOG.exception("authz cache SET failed for %s; continuing without cache", key)
