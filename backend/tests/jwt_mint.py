"""Test-only ES256 access-token minting. Not part of the API package."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from untangled.seed.users import SEED_USERS


def mint_access_token(
    user_id: UUID,
    *,
    now: datetime | None = None,
    ttl_seconds: int = 900,
    extra: dict[str, object] | None = None,
    private_pem: str | None = None,
    algorithm: str = "ES256",
) -> str:
    """Sign an access JWT with the test private key (or ``private_pem``)."""
    pem = private_pem if private_pem is not None else os.environ["UNTANGLED_JWT_PRIVATE_KEY"]
    key = load_pem_private_key(pem.encode("utf-8"), password=None)
    issued = now or datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "sid": "01900000-0000-7000-8000-0000000000aa",
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=ttl_seconds)).timestamp()),
        "typ": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, key, algorithm=algorithm)


def bearer_for(username: str) -> str:
    """Mint an access JWT for a seed user by username."""
    seed = next(s for s in SEED_USERS if s.username == username)
    return mint_access_token(seed.id)
