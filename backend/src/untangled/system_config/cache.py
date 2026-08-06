"""In-process full-object cache for system-config (TTL + flush-ready)."""

from __future__ import annotations

import time
from dataclasses import dataclass

from psycopg import Connection
from pydantic import BaseModel

from untangled.system_config.helpers import load_system_config


@dataclass
class _CacheEntry:
    value: BaseModel
    expires_at: float


class SystemConfigCache:
    """Process-local cache of the clamped system-config object.

    Expiry uses ``system_config_cache_ttl_seconds`` from the cached (clamped)
    object. ``invalidate()`` clears the entry for a future flush broadcast;
    this ticket does not wire a bus.
    """

    def __init__(self) -> None:
        self._entry: _CacheEntry | None = None

    def invalidate(self) -> None:
        """Drop the cached object (future flush hook)."""
        self._entry = None

    def get(self, conn: Connection) -> BaseModel:
        """Return cached object, or load/clamp/store after expiry or miss."""
        now = time.monotonic()
        entry = self._entry
        if entry is not None and now < entry.expires_at:
            return entry.value
        value = load_system_config(conn)
        ttl = int(getattr(value, "system_config_cache_ttl_seconds"))
        self._entry = _CacheEntry(value=value, expires_at=now + ttl)
        return value


default_cache = SystemConfigCache()


def get_system_config(
    conn: Connection,
    *,
    cache: SystemConfigCache | None = None,
) -> BaseModel:
    """Read system-config via ``cache`` (default process cache)."""
    return (cache if cache is not None else default_cache).get(conn)
