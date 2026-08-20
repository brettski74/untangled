"""JWT access-token verify (ES256 public key)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

import jwt

from untangled.auth.settings import jwt_public_key

ACCESS_TOKEN_ALGORITHM = "ES256"
PASSWORD_CHANGE_REQUIRED_CLAIM = "password_change_required"
PASSWORD_CHANGE_REQUIRED_ERROR = "password_change_required"
SESSION_ID_CLAIM = "sid"
ACCESS_TOKEN_IAT_SKEW_SECONDS = 60
ACCESS_TOKEN_TYP = "access"

AccessJwtKind = Literal["valid", "expired", "invalid"]


class AccessJwtResult:
    """Outcome of the shared access-JWT wrapper (API resources)."""

    __slots__ = ("kind", "payload", "error")

    def __init__(
        self,
        kind: AccessJwtKind,
        payload: dict[str, Any] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.kind = kind
        self.payload = payload
        self.error = error


def _custom_claims_ok(payload: dict[str, Any], now: datetime) -> bool:
    if payload.get("typ") != ACCESS_TOKEN_TYP:
        return False
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        return False
    try:
        UUID(sub)
    except ValueError:
        return False
    sid = payload.get(SESSION_ID_CLAIM)
    if not isinstance(sid, str) or not sid:
        return False
    iat = payload.get("iat")
    exp = payload.get("exp")
    if not isinstance(iat, (int, float)) or not isinstance(exp, (int, float)):
        return False
    if not (exp > iat):
        return False
    if iat > now.timestamp() + ACCESS_TOKEN_IAT_SKEW_SECONDS:
        return False
    return True


def verify_access_jwt(
    token: str, *, now: datetime | None = None
) -> AccessJwtResult:
    """Library verify, then custom claims. ``expired`` means valid except wall-clock ``exp``."""
    clock = now if now is not None else datetime.now(timezone.utc)
    key = jwt_public_key()
    options_require = {"require": ["exp", "iat", "sub"]}
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[ACCESS_TOKEN_ALGORITHM],
            options=options_require,
        )
    except jwt.ExpiredSignatureError:
        pass
    except jwt.PyJWTError as exc:
        return AccessJwtResult("invalid", error=exc)
    else:
        if not _custom_claims_ok(payload, clock):
            return AccessJwtResult("invalid")
        return AccessJwtResult("valid", payload)
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[ACCESS_TOKEN_ALGORITHM],
            options={**options_require, "verify_exp": False},
        )
    except jwt.PyJWTError as exc:
        return AccessJwtResult("invalid", error=exc)
    if not _custom_claims_ok(payload, clock):
        return AccessJwtResult("invalid")
    return AccessJwtResult("expired", payload)


def decode_access_payload(token: str) -> dict:
    """Validate an unexpired ES256 access JWT and return the payload.

    Raises ``jwt.PyJWTError`` (or subclasses) on failure.
    """
    result = verify_access_jwt(token)
    if result.kind == "valid" and result.payload is not None:
        return result.payload
    if result.kind == "expired":
        raise jwt.ExpiredSignatureError("Signature has expired")
    if result.error is not None:
        raise result.error
    raise jwt.InvalidTokenError("invalid access token")


def decode_access_token(token: str) -> UUID:
    """Validate an ES256 access JWT and return the subject user id."""
    return UUID(decode_access_payload(token)["sub"])


def password_change_required(payload: dict) -> bool:
    """True when the signed private claim is exactly boolean true."""
    return payload.get(PASSWORD_CHANGE_REQUIRED_CLAIM) is True
