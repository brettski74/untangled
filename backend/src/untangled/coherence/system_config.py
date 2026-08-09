"""System-config cache coherence: publish on write, subscribe on API startup."""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from typing import Any

from untangled.coherence.protocol import CoherenceBus
from untangled.coherence.redis_bus import RedisCoherenceBus
from untangled.coherence.topics import (
    SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
    SYSTEM_CONFIG_INVALIDATE_TOPIC,
)
from untangled.redis import redact_redis_url, redis_url
from untangled.system_config.cache import SystemConfigCache, default_cache

_LOG = logging.getLogger("untangled.coherence")

_default_bus: CoherenceBus | None = None


def get_default_bus() -> CoherenceBus:
    """Return the process default Redis coherence bus (lazy; no import-time connect)."""
    global _default_bus
    if _default_bus is None:
        _default_bus = RedisCoherenceBus()
    return _default_bus


def set_default_bus_for_tests(bus: CoherenceBus | None) -> None:
    """Replace or clear the process default bus (tests only)."""
    global _default_bus
    _default_bus = bus


def notify_system_config_changed(
    *,
    bus: CoherenceBus | None = None,
    cache: SystemConfigCache | None = None,
) -> None:
    """Invalidate the local system-config cache and publish a flush signal.

    Publish failures are logged (URL redacted) and do not raise — the persisted
    write must remain fail-soft. Local invalidate always runs first.
    """
    target = cache if cache is not None else default_cache
    target.invalidate()
    publisher = bus if bus is not None else get_default_bus()
    try:
        publisher.publish(
            SYSTEM_CONFIG_INVALIDATE_TOPIC,
            SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
        )
    except Exception:
        try:
            safe_url = redact_redis_url(redis_url())
        except Exception:
            safe_url = "<unavailable>"
        _LOG.exception(
            "system-config coherence publish failed (redis=%s); "
            "peer caches may stay stale until TTL",
            safe_url,
        )


def start_system_config_subscriber(
    *,
    bus: CoherenceBus | None = None,
    cache: SystemConfigCache | None = None,
) -> Callable[[], None]:
    """Subscribe to system-config invalidate and clear ``cache`` (default process).

    Fails loudly if Redis is missing/unreachable. Returns a stop callable for
    clean process shutdown. Does not connect at module import — only when called.
    """
    target = cache if cache is not None else default_cache
    transport = bus if bus is not None else RedisCoherenceBus()

    def _handler(_payload: Mapping[str, Any]) -> None:
        target.invalidate()

    return transport.subscribe(SYSTEM_CONFIG_INVALIDATE_TOPIC, _handler)
