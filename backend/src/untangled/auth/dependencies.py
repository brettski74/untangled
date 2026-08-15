"""FastAPI dependencies for Bearer access-token auth."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import Connection

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.store import fetch_user_by_id
from untangled.auth.tokens import decode_access_token
from untangled.persistence.connection import connect

# auto_error=False: default HTTPBearer raises 403 on a missing header.
# Leftover /auth/me and peers keep 401 + WWW-Authenticate: Bearer.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Connection]:
    """Yield a short-lived DB connection for a request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


DbConn = Annotated[Connection, Depends(get_db)]


def _credentials_exc() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _access_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> str:
    """Extract the Bearer JWT, or 401 if the Authorization header is missing/non-Bearer."""
    if creds is None or not creds.credentials:
        raise _credentials_exc()
    return creds.credentials


AccessToken = Annotated[str, Depends(_access_token)]


def get_current_user(
    request: Request,
    token: AccessToken,
    conn: DbConn,
) -> dict[str, Any]:
    """Resolve the Bearer access token to an active user row."""
    credentials_exc = _credentials_exc()
    try:
        user_id: UUID = decode_access_token(token)
    except jwt.PyJWTError as exc:
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
        raise credentials_exc from exc

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
        raise credentials_exc
    return user


def get_password_change_subject(
    token: AccessToken,
    conn: DbConn,
) -> dict[str, Any]:
    """Resolve Bearer → user for change-password (inactive admitted past the gate).

    Missing/invalid/unresolvable token → 401. Inactive users continue into the
    always-run pipeline so locked accounts still receive uniform 422.
    """
    credentials_exc = _credentials_exc()
    try:
        user_id: UUID = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise credentials_exc from exc

    user = fetch_user_by_id(conn, user_id)
    if user is None:
        raise credentials_exc
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
PasswordChangeSubject = Annotated[dict[str, Any], Depends(get_password_change_subject)]
