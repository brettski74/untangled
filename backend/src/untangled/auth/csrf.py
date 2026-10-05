"""Origin + CSRF double-submit for cookie-authenticated unsafe API methods."""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Request, status

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_fail_closed, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.settings import (
    CSRF_COOKIE_NAME,
    EVENT_TEXT_BOUND,
    public_origin,
)

CSRF_DENIED_ORIGIN = "origin_mismatch"
CSRF_DENIED_CSRF = "csrf_mismatch"

_SAFE_METHODS = frozenset({"GET", "OPTIONS"})


def origin_is_exact_match(origin_header: str | None, expected: str) -> bool:
    if origin_header is None or origin_header == "":
        return False
    return origin_header == expected


def tokens_equal(left: str, right: str) -> bool:
    left_b = left.encode("utf-8")
    right_b = right.encode("utf-8")
    if len(left_b) != len(right_b):
        hmac.compare_digest(left_b, left_b)
        return False
    return hmac.compare_digest(left_b, right_b)


def bound_event_text(raw: str, limit: int = EVENT_TEXT_BOUND) -> str:
    if len(raw) <= limit:
        return raw
    return raw[:limit]


def _header_value(request: Request, name: str) -> str:
    value = request.headers.get(name)
    return value if value is not None else ""


def enforce_cookie_csrf(request: Request) -> None:
    """Refuse cookie-auth unsafe methods that fail Origin or CSRF double-submit.

    GET and OPTIONS skip. Emit ``auth.csrf_denied`` fail-closed: if emit throws,
    raise 500 rather than a CSRF-shaped 403.
    """
    if request.method.upper() in _SAFE_METHODS:
        return
    origin = _header_value(request, "origin")
    if not origin_is_exact_match(origin, public_origin()):
        _refuse(request, CSRF_DENIED_ORIGIN)
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME) or ""
    header_token = _header_value(request, "x-csrf-token")
    if cookie_token == "" or header_token == "" or not tokens_equal(cookie_token, header_token):
        _refuse(request, CSRF_DENIED_CSRF)


def _refuse(request: Request, reason: str) -> None:
    origin = _header_value(request, "origin")
    csrf_header = _header_value(request, "x-csrf-token")
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME) or ""
    event = make_event(
        event_type=EventType.AUTH_CSRF_DENIED,
        actor_channel=ActorChannel.HUMAN,
        outcome=Outcome.FAILURE,
        reason=reason,
        severity=Severity.NOTICE,
        ip_address=client_ip(request),
        data={
            "method": request.method or "",
            "context_path": request.url.path,
            "origin": bound_event_text(origin),
            "user_agent": bound_event_text(_header_value(request, "user-agent")),
            "csrf_header_length": len(csrf_header),
            "csrf_cookie_length": len(csrf_cookie),
        },
    )
    try:
        emit_fail_closed(event)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Audit logging failed",
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden",
    )
