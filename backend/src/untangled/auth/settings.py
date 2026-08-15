"""Auth settings from environment. Access JWTs are ES256; the API holds the public key only."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _normalize_pem(raw: str) -> str:
    pem = raw.strip()
    if "\\n" in pem and "\n" not in pem:
        pem = pem.replace("\\n", "\n")
    return pem


def _read_public_pem() -> str:
    text = os.environ.get("UNTANGLED_JWT_PUBLIC_KEY", "").strip()
    path = os.environ.get("UNTANGLED_JWT_PUBLIC_KEY_PATH", "").strip()
    if text and path:
        raise RuntimeError(
            "UNTANGLED_JWT_PUBLIC_KEY and UNTANGLED_JWT_PUBLIC_KEY_PATH cannot both be set"
        )
    if text:
        return _normalize_pem(text)
    if path:
        try:
            return _normalize_pem(Path(path).read_text(encoding="utf-8"))
        except OSError as exc:
            raise RuntimeError(
                f"UNTANGLED_JWT_PUBLIC_KEY_PATH is unreadable ({path})"
            ) from exc
    raise RuntimeError(
        "UNTANGLED_JWT_PUBLIC_KEY or UNTANGLED_JWT_PUBLIC_KEY_PATH is required; "
        "refusing to start without an ES256 public key"
    )


@lru_cache(maxsize=1)
def jwt_public_key() -> EllipticCurvePublicKey:
    """Load the ES256 public key used to verify access tokens (fail closed)."""
    pem = _read_public_pem()
    try:
        key = load_pem_public_key(pem.encode("utf-8"))
    except ValueError as exc:
        raise RuntimeError("UNTANGLED_JWT_PUBLIC_KEY must be an SPKI P-256 public key") from exc
    if not isinstance(key, EllipticCurvePublicKey):
        raise RuntimeError("UNTANGLED_JWT_PUBLIC_KEY must be an EC public key")
    if key.curve.name != "secp256r1":
        raise RuntimeError("UNTANGLED_JWT_PUBLIC_KEY must be a P-256 (secp256r1) key")
    return key


def reset_jwt_public_key_for_tests() -> None:
    """Drop the cached public key so test env changes take effect."""
    jwt_public_key.cache_clear()


def access_token_ttl_seconds() -> int:
    """Access token lifetime in seconds (default 15 minutes)."""
    return _int_env("UNTANGLED_ACCESS_TOKEN_TTL_SECONDS", 15 * 60)


def refresh_token_ttl_seconds() -> int:
    """Refresh token lifetime in seconds (default 7 days)."""
    return _int_env("UNTANGLED_REFRESH_TOKEN_TTL_SECONDS", 7 * 24 * 60 * 60)
