"""JWT access-token verify (ES256 public key)."""

from __future__ import annotations

from uuid import UUID

import jwt

from untangled.auth.settings import jwt_public_key

ACCESS_TOKEN_ALGORITHM = "ES256"
PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required"
PASSWORD_CHANGE_REQUIRED_ERROR = "password_change_required"


def decode_access_payload(token: str) -> dict:
    """Validate an ES256 access JWT and return the payload.

    Raises ``jwt.PyJWTError`` (or subclasses) on failure.
    """
    payload = jwt.decode(
        token,
        jwt_public_key(),
        algorithms=[ACCESS_TOKEN_ALGORITHM],
        options={"require": ["exp", "iat", "sub"]},
    )
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise jwt.InvalidTokenError("missing subject")
    try:
        UUID(sub)
    except ValueError as exc:
        raise jwt.InvalidTokenError("invalid subject") from exc
    return payload


def decode_access_token(token: str) -> UUID:
    """Validate an ES256 access JWT and return the subject user id."""
    return UUID(decode_access_payload(token)["sub"])


def password_change_required(payload: dict) -> bool:
    """True when the signed private claim is exactly boolean true."""
    return payload.get(PASSWORD_CHANGE_REQUIRED_CLAIM) is True
