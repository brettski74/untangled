"""Cache-coherence / invalidation signaling (Redis pub/sub MVP).

This package is **not** the undecided internal domain/workflow event bus and
**not** an audit or durable event channel. Topics are namespaced coherence
signals only (best-effort / at-most-once; no replay).
"""

from untangled.coherence.protocol import CoherenceBus
from untangled.coherence.redis_bus import RedisCoherenceBus
from untangled.coherence.system_config import (
    notify_system_config_changed,
    start_system_config_subscriber,
)
from untangled.coherence.topics import (
    SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
    SYSTEM_CONFIG_INVALIDATE_TOPIC,
)

__all__ = [
    "CoherenceBus",
    "RedisCoherenceBus",
    "SYSTEM_CONFIG_INVALIDATE_PAYLOAD",
    "SYSTEM_CONFIG_INVALIDATE_TOPIC",
    "notify_system_config_changed",
    "start_system_config_subscriber",
]
