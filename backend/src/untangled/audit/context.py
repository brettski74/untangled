"""Request-scoped correlation id and client IP helpers."""

from __future__ import annotations

from contextvars import ContextVar
from uuid import uuid4

from starlette.requests import Request

_correlation_id: ContextVar[str | None] = ContextVar("audit_correlation_id", default=None)


def get_correlation_id() -> str:
    """Return the current request correlation id or a fresh id if unset."""
    current = _correlation_id.get()
    if current:
        return current
    return str(uuid4())


def set_correlation_id(value: str) -> None:
    _correlation_id.set(value)


def reset_correlation_id() -> None:
    _correlation_id.set(None)


def client_ip(request: Request | None) -> str | None:
    """Client address as seen by the API process (direct peer only).

    Full trusted-proxy / forwarded-header policy is owned by GitHub #67.
    """
    if request is None or request.client is None:
        return None
    return request.client.host
