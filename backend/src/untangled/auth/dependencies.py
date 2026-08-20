"""FastAPI dependencies for Bearer access-token auth."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import Connection

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.store import fetch_user_by_id
from untangled.auth.tokens import (
    PASSWORD_CHANGE_REQUIRED_ERROR,
    password_change_required,
    verify_access_jwt,
)
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.persistence.connection import connect

# auto_error=False: default HTTPBearer raises 403 on a missing header.
_bearer_scheme = HTTPBearer(auto_error=False)

_CREDENTIALS_DETAIL = "Could not validate credentials"


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


async def credentials_denied_handler(
    _request: Request, exc: CredentialsDenied
) -> JSONResponse:
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


def _access_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> str:
    """Extract the Bearer JWT, or 401 if the Authorization header is missing/non-Bearer."""
    if creds is None or not creds.credentials:
        raise CredentialsDenied()
    return creds.credentials


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
    """Resolve the Bearer access token to an active user row."""
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

    if password_change_required(payload) and not _system_config_singleton_get(
        request
    ):
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
