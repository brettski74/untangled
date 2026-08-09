"""Redis pub/sub implementation of the coherence bus."""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable, Mapping
from typing import Any

from redis import Redis
from redis.client import PubSub

from untangled.redis import (
    create_command_client,
    create_subscriber_client,
    redact_redis_url,
    redis_url,
)

_LOG = logging.getLogger("untangled.coherence")


class RedisCoherenceBus:
    """Best-effort Redis pub/sub coherence transport (at-most-once; no replay)."""

    def __init__(
        self,
        *,
        url: str | None = None,
        command_client: Redis | None = None,
        subscriber_client_factory: Callable[[], Redis] | None = None,
    ) -> None:
        self._url = url if url is not None else redis_url()
        self._command = command_client or create_command_client(url=self._url)
        self._subscriber_factory = subscriber_client_factory or (
            lambda: create_subscriber_client(url=self._url)
        )
        self._lock = threading.Lock()

    def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
        body = json.dumps(dict(payload), separators=(",", ":"), sort_keys=True)
        self._command.publish(topic, body)

    def subscribe(
        self,
        topic: str,
        handler: Callable[[Mapping[str, Any]], None],
    ) -> Callable[[], None]:
        subscriber = self._subscriber_factory()
        try:
            subscriber.ping()
        except Exception as exc:
            subscriber.close()
            raise RuntimeError(
                "Redis unreachable for coherence subscriber "
                f"({redact_redis_url(self._url)})"
            ) from exc

        pubsub: PubSub = subscriber.pubsub(ignore_subscribe_messages=True)

        def _on_message(message: dict[str, Any]) -> None:
            raw = message.get("data")
            if not isinstance(raw, str):
                return
            try:
                parsed: Any = json.loads(raw)
            except json.JSONDecodeError:
                _LOG.warning("coherence message on %s is not JSON; ignoring", topic)
                return
            if not isinstance(parsed, dict):
                _LOG.warning("coherence message on %s is not an object; ignoring", topic)
                return
            handler(parsed)

        pubsub.subscribe(**{topic: _on_message})
        thread = pubsub.run_in_thread(sleep_time=0.01, daemon=True)
        stopped = False

        def stop() -> None:
            nonlocal stopped
            with self._lock:
                if stopped:
                    return
                stopped = True
            try:
                pubsub.unsubscribe(topic)
            except Exception:
                _LOG.debug("unsubscribe during coherence stop failed", exc_info=True)
            try:
                thread.stop()
            except Exception:
                _LOG.exception("error stopping coherence subscriber thread")
            # Wait for the worker to leave get_message before closing sockets.
            try:
                thread.join(timeout=2.0)
            except Exception:
                _LOG.debug("join coherence subscriber thread failed", exc_info=True)
            try:
                pubsub.close()
            except Exception:
                _LOG.exception("error closing coherence pubsub")
            try:
                subscriber.close()
            except Exception:
                _LOG.exception("error closing coherence subscriber client")

        return stop
