"""FastAPI dependencies for Bearer access-token auth."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from psycopg import Connection

from untangled.auth.store import fetch_user_by_id
from untangled.auth.tokens import decode_access_token
from untangled.persistence.connection import connect

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)


def get_db() -> Iterator[Connection]:
    """Yield a short-lived DB connection for a request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


DbConn = Annotated[Connection, Depends(get_db)]


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    conn: DbConn,
) -> dict[str, Any]:
    """Resolve the Bearer access token to an active user row."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id: UUID = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise credentials_exc from exc

    user = fetch_user_by_id(conn, user_id)
    if user is None or not user["is_active"]:
        raise credentials_exc
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
