"""Coherence bus: Redis round-trip, system-config peer flush, fail-soft publish."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Mapping
from typing import Any

import pytest
from pydantic import BaseModel, ConfigDict

from untangled.coherence.redis_bus import RedisCoherenceBus
from untangled.coherence.system_config import (
    notify_system_config_changed,
    set_default_bus_for_tests,
    start_system_config_subscriber,
)
from untangled.coherence.topics import (
    SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
    SYSTEM_CONFIG_INVALIDATE_TOPIC,
)
from untangled.redis import redact_redis_url
from untangled.system_config.cache import SystemConfigCache


def _wait_until(predicate, *, timeout: float = 2.0, interval: float = 0.02) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval)
    raise AssertionError("condition not met before timeout")


@pytest.fixture(autouse=True)
def _reset_default_bus() -> None:
    set_default_bus_for_tests(None)
    yield
    set_default_bus_for_tests(None)


@pytest.fixture
def redis_bus(monkeypatch: pytest.MonkeyPatch) -> RedisCoherenceBus:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://127.0.0.1:6379/0")
    bus = RedisCoherenceBus()
    try:
        bus._command.ping()
    except Exception as exc:
        pytest.skip(f"Redis not available ({exc})")
    return bus


def test_redis_coherence_publish_subscribe_round_trip(redis_bus: RedisCoherenceBus) -> None:
    received: list[Mapping[str, Any]] = []
    ready = threading.Event()

    def handler(payload: Mapping[str, Any]) -> None:
        received.append(payload)
        ready.set()

    topic = f"untangled.coherence.test.round_trip.{time.time_ns()}"
    stop = redis_bus.subscribe(topic, handler)
    try:
        # Allow subscribe to register before publish.
        time.sleep(0.05)
        redis_bus.publish(topic, {"v": 1, "probe": "ok"})
        assert ready.wait(timeout=2.0)
        assert received == [{"v": 1, "probe": "ok"}]
    finally:
        stop()


def test_system_config_peer_cache_invalidates_on_publish(
    redis_bus: RedisCoherenceBus,
) -> None:
    class _Cfg(BaseModel):
        model_config = ConfigDict(extra="forbid")
        system_config_cache_ttl_seconds: int = 900

    from untangled.system_config.cache import _CacheEntry

    peer = SystemConfigCache()
    peer._entry = _CacheEntry(value=_Cfg(), expires_at=time.monotonic() + 900)
    assert peer._entry is not None
    original_expiry = peer._entry.expires_at

    stop = start_system_config_subscriber(bus=redis_bus, cache=peer)
    try:
        time.sleep(0.05)
        redis_bus.publish(
            SYSTEM_CONFIG_INVALIDATE_TOPIC,
            SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
        )
        _wait_until(
            lambda: peer._entry is not None
            and peer._entry.expires_at < original_expiry
        )
        assert peer._entry is not None
        assert peer._entry.value.system_config_cache_ttl_seconds == 900
    finally:
        stop()


def test_notify_fail_soft_logs_without_raising(
    caplog: pytest.LogCaptureFixture,
) -> None:
    class BrokenBus:
        def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
            raise RuntimeError("redis down")

        def subscribe(self, topic: str, handler):  # noqa: ANN001
            raise AssertionError("subscribe should not be called")

    cache = SystemConfigCache()
    from untangled.system_config.cache import _CacheEntry

    class _Cfg(BaseModel):
        model_config = ConfigDict(extra="forbid")
        system_config_cache_ttl_seconds: int = 900

    cache._entry = _CacheEntry(value=_Cfg(), expires_at=time.monotonic() + 900)

    with caplog.at_level(logging.ERROR, logger="untangled.coherence"):
        notify_system_config_changed(bus=BrokenBus(), cache=cache)

    assert cache._entry is not None
    assert cache._entry.expires_at <= time.monotonic()
    assert cache._entry.value.system_config_cache_ttl_seconds == 900
    assert any("system-config coherence publish failed" in r.message for r in caplog.records)
    for record in caplog.records:
        assert "s3cret" not in record.getMessage()


def test_notify_fail_soft_redacts_password_in_log(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://:s3cret@127.0.0.1:6379/0")

    class BrokenBus:
        def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
            raise RuntimeError("boom")

        def subscribe(self, topic: str, handler):  # noqa: ANN001
            raise AssertionError("unused")

    with caplog.at_level(logging.ERROR, logger="untangled.coherence"):
        notify_system_config_changed(bus=BrokenBus(), cache=SystemConfigCache())

    joined = " ".join(r.getMessage() for r in caplog.records)
    assert "s3cret" not in joined
    assert redact_redis_url("redis://:s3cret@127.0.0.1:6379/0") in joined


def test_subscriber_startup_fails_when_redis_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://127.0.0.1:1")
    with pytest.raises(RuntimeError, match="Redis unreachable"):
        start_system_config_subscriber()


def test_subscriber_startup_fails_when_url_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "")
    with pytest.raises(Exception, match="empty|Redis"):
        start_system_config_subscriber()


def test_notify_uses_injected_bus() -> None:
    published: list[tuple[str, Mapping[str, Any]]] = []

    class CaptureBus:
        def publish(self, topic: str, payload: Mapping[str, Any]) -> None:
            published.append((topic, dict(payload)))

        def subscribe(self, topic: str, handler):  # noqa: ANN001
            raise AssertionError("unused")

    notify_system_config_changed(bus=CaptureBus(), cache=SystemConfigCache())
    assert published == [
        (SYSTEM_CONFIG_INVALIDATE_TOPIC, SYSTEM_CONFIG_INVALIDATE_PAYLOAD)
    ]


def test_lifespan_starts_subscriber(
    redis_bus: RedisCoherenceBus,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API lifespan wires system-config subscriber (requires Redis)."""
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://127.0.0.1:6379/0")
    from fastapi.testclient import TestClient

    from untangled.main import app

    # Avoid double-subscribe noise: lifespan uses default RedisCoherenceBus.
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
