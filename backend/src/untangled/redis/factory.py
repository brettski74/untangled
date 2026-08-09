"""Redis client factory: command clients vs dedicated subscriber clients."""

from __future__ import annotations

from redis import Redis

from untangled.redis.settings import RedisConfigError, redis_url
from untangled.redis.url import redact_redis_url

__all__ = [
    "RedisConfigError",
    "create_command_client",
    "create_subscriber_client",
]


def create_command_client(*, url: str | None = None) -> Redis:
    """Create a Redis client for ordinary commands (GET/SET/PUBLISH, …).

    Do **not** call ``subscribe`` on this connection. Pub/sub subscribers need
    :func:`create_subscriber_client` (dedicated connection).
    """
    resolved = url if url is not None else redis_url()
    try:
        client = Redis.from_url(
            resolved,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
    except Exception as exc:
        raise RedisConfigError(
            f"failed to create Redis command client for {redact_redis_url(resolved)}"
        ) from exc
    return client


def create_subscriber_client(*, url: str | None = None) -> Redis:
    """Create a Redis client intended only for pub/sub subscribe loops.

    Subscriber connections must not be reused for ordinary command traffic
    (including publish from request handlers).
    """
    resolved = url if url is not None else redis_url()
    try:
        client = Redis.from_url(
            resolved,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
    except Exception as exc:
        raise RedisConfigError(
            f"failed to create Redis subscriber client for {redact_redis_url(resolved)}"
        ) from exc
    return client
