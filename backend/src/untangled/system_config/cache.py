"""In-process full-object cache for system-config (TTL + flush-ready)."""

from __future__ import annotations

import time
from dataclasses import dataclass

from psycopg import Connection
from pydantic import BaseModel

from untangled.system_config.helpers import load_system_config

_RELOAD_BACKOFF_SECONDS = 30.0


@dataclass
class _CacheEntry:
    value: BaseModel
    expires_at: float


class SystemConfigCache:
    """Process-local last-known-good cache of the clamped system-config object.

    Expiry uses ``system_config_cache_ttl_seconds`` from the cached (clamped)
    object. ``invalidate()`` marks the entry stale without dropping it so a
    failed reload keeps serving the last good object.
    """

    def __init__(self) -> None:
        self._entry: _CacheEntry | None = None

    def invalidate(self) -> None:
        """Expire the cached object so the next get reloads; keep last-good."""
        entry = self._entry
        if entry is None:
            return
        self._entry = _CacheEntry(value=entry.value, expires_at=time.monotonic())

    def get(self, conn: Connection) -> BaseModel:
        """Return cached object, or load/clamp/store after expiry or miss."""
        now = time.monotonic()
        entry = self._entry
        if entry is not None and now < entry.expires_at:
            return entry.value
        try:
            value = load_system_config(conn)
        except Exception:
            if entry is None:
                raise
            self._entry = _CacheEntry(
                value=entry.value,
                expires_at=now + _RELOAD_BACKOFF_SECONDS,
            )
            return entry.value
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
