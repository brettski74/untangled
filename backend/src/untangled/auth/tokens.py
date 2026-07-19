"""JWT access tokens and opaque refresh-token helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import jwt

from untangled.auth.settings import (
    access_token_ttl_seconds,
    jwt_secret,
    refresh_token_ttl_seconds,
)

ACCESS_TOKEN_ALGORITHM = "HS256"


def create_access_token(user_id: UUID, *, now: datetime | None = None) -> str:
    """Mint a short-lived JWT access token with ``sub`` = user id."""
    issued = now or datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=access_token_ttl_seconds())).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, jwt_secret(), algorithm=ACCESS_TOKEN_ALGORITHM)


def decode_access_token(token: str) -> UUID:
    """Validate an access JWT and return the subject user id.

    Raises ``jwt.PyJWTError`` (or subclasses) on failure.
    """
    payload = jwt.decode(token, jwt_secret(), algorithms=[ACCESS_TOKEN_ALGORITHM])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise jwt.InvalidTokenError("missing subject")
    try:
        return UUID(sub)
    except ValueError as exc:
        raise jwt.InvalidTokenError("invalid subject") from exc


def new_refresh_token() -> str:
    """Return a new opaque refresh token (plaintext; store only the hash)."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA-256 hex digest for storing refresh tokens at rest."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_expiry(*, now: datetime | None = None) -> datetime:
    """Return UTC expiry for a newly issued refresh token."""
    issued = now or datetime.now(timezone.utc)
    return issued + timedelta(seconds=refresh_token_ttl_seconds())
