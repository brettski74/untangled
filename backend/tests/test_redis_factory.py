"""Redis factory, URL redaction, and config helpers."""

from __future__ import annotations

import pytest

from untangled.redis import (
    DEFAULT_REDIS_URL,
    RedisConfigError,
    create_command_client,
    create_subscriber_client,
    redact_redis_url,
    redis_url,
)


def test_redis_url_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UNTANGLED_REDIS_URL", raising=False)
    assert redis_url() == DEFAULT_REDIS_URL


def test_redis_url_empty_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "   ")
    with pytest.raises(RedisConfigError, match="empty"):
        redis_url()


def test_redis_url_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://example:6379/2")
    assert redis_url() == "redis://example:6379/2"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("redis://127.0.0.1:6379/0", "redis://127.0.0.1:6379/0"),
        ("redis://:s3cret@127.0.0.1:6379/0", "redis://127.0.0.1:6379/0"),
        ("redis://user:s3cret@host:6379/1", "redis://user@host:6379/1"),
        (
            "rediss://user:s3cret@redis.example:6380/0",
            "rediss://user@redis.example:6380/0",
        ),
    ],
)
def test_redact_redis_url(raw: str, expected: str) -> None:
    assert redact_redis_url(raw) == expected
    assert "s3cret" not in redact_redis_url(raw)


def test_command_and_subscriber_clients_are_distinct(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("UNTANGLED_REDIS_URL", "redis://127.0.0.1:6379/0")
    command = create_command_client()
    subscriber = create_subscriber_client()
    try:
        assert command is not subscriber
        # Distinct underlying connections (connection kwargs / pool objects).
        assert command.connection_pool is not subscriber.connection_pool
    finally:
        command.close()
        subscriber.close()
