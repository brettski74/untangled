"""FastAPI dependencies for access-token auth (Bearer xor access cookie)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from psycopg import Connection

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.csrf import enforce_cookie_csrf
from untangled.auth.settings import ACCESS_COOKIE_NAME
from untangled.auth.store import fetch_user_by_id
from untangled.auth.tokens import (
    PASSWORD_CHANGE_REQUIRED_ERROR,
    password_change_required,
    verify_access_jwt,
)
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.persistence.connection import connect

_CREDENTIALS_DETAIL = "Could not validate credentials"
_DUAL_PRESENTATION_DETAIL = "Bad request"


class CredentialsDenied(Exception):
    """Resource 401. ``retry`` is set only for expired-but-otherwise-valid access JWTs."""

    def __init__(self, *, retry: bool = False) -> None:
        self.retry = retry


def get_db() -> Iterator[Connection]:
    """Yield a short-lived DB connection for a request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


DbConn = Annotated[Connection, Depends(get_db)]


async def credentials_denied_handler(_request: Request, exc: CredentialsDenied) -> JSONResponse:
    body: dict[str, Any] = {"detail": _CREDENTIALS_DETAIL}
    if exc.retry:
        body["retry"] = True
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content=body,
        headers={"WWW-Authenticate": "Bearer"},
    )


def register_auth_exception_handlers(app: FastAPI) -> None:
    """Install the resource-401 handler (sibling ``retry`` field)."""
    app.add_exception_handler(CredentialsDenied, credentials_denied_handler)


def _must_change_exc() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": PASSWORD_CHANGE_REQUIRED_ERROR,
            "detail": "Password change required",
        },
    )


def _nonempty_stripped(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip()


def _bearer_credentials(request: Request) -> str:
    """Return a non-empty Bearer token, or empty when that presentation is absent."""
    header = request.headers.get("authorization")
    if header is None:
        return ""
    parts = header.split(None, 1)
    if not parts or parts[0].lower() != "bearer":
        return ""
    if len(parts) == 1:
        return ""
    return _nonempty_stripped(parts[1])


def _access_cookie(request: Request) -> str:
    return _nonempty_stripped(request.cookies.get(ACCESS_COOKIE_NAME))


def _access_token(request: Request) -> str:
    """Exactly one of Bearer or ``__untangled_access``; dual presentation is 400.

    Cookie-authenticated methods other than GET/OPTIONS require Origin + CSRF
    before the JWT is inspected.
    """
    bearer = _bearer_credentials(request)
    cookie = _access_cookie(request)
    if bearer != "" and cookie != "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUAL_PRESENTATION_DETAIL,
        )
    if bearer == "" and cookie == "":
        raise CredentialsDenied()
    if cookie != "":
        enforce_cookie_csrf(request)
        return cookie
    return bearer


AccessToken = Annotated[str, Depends(_access_token)]


def _system_config_singleton_get(request: Request) -> bool:
    if request.method != "GET":
        return False
    return request.url.path == f"/api/v2/system_config/{SYSTEM_CONFIG_ID}"


def get_current_user(
    request: Request,
    token: AccessToken,
    conn: DbConn,
) -> dict[str, Any]:
    """Resolve the access token to an active user row."""
    verified = verify_access_jwt(token)
    if verified.kind == "invalid" or verified.payload is None:
        emit_best_effort(
            make_event(
                event_type=EventType.RECORD_AUTHN_DENIED,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.FAILURE,
                reason="invalid_access_token",
                severity=Severity.WARNING,
                ip_address=client_ip(request),
            )
        )
        raise CredentialsDenied()
    if verified.kind == "expired":
        emit_best_effort(
            make_event(
                event_type=EventType.RECORD_AUTHN_DENIED,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.FAILURE,
                reason="expired_access_token",
                severity=Severity.WARNING,
                ip_address=client_ip(request),
            )
        )
        raise CredentialsDenied(retry=True)

    payload = verified.payload
    user_id = UUID(payload["sub"])

    if password_change_required(payload) and not _system_config_singleton_get(request):
        raise _must_change_exc()

    user = fetch_user_by_id(conn, user_id)
    if user is None or not user["is_active"]:
        emit_best_effort(
            make_event(
                event_type=EventType.RECORD_AUTHN_DENIED,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.FAILURE,
                reason="inactive_or_missing_user",
                severity=Severity.WARNING,
                user_id=user_id if user is not None else None,
                ip_address=client_ip(request),
            )
        )
        raise CredentialsDenied()
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
