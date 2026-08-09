"""Pluggable coherence/invalidation bus surface."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, Protocol


class CoherenceBus(Protocol):
    """Small publish/subscribe surface for cache-coherence signals.

    Implementations are swappable by wiring; this is not a plugin marketplace.
    """

    def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
        """Publish a JSON-serializable payload on ``topic``."""

    def subscribe(
        self,
        topic: str,
        handler: Callable[[Mapping[str, Any]], None],
    ) -> Callable[[], None]:
        """Register ``handler`` for ``topic``.

        Returns a zero-arg callable that stops the subscription cleanly.
        """
