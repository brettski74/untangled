"""Auth settings from environment. Access JWTs are ES256; the API holds the public key only."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

ACCESS_COOKIE_NAME = "__untangled_access"
CSRF_COOKIE_NAME = "__untangled_csrf"
EVENT_TEXT_BOUND = 256


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
            raise RuntimeError(f"UNTANGLED_JWT_PUBLIC_KEY_PATH is unreadable ({path})") from exc
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


def _require_exact_origin(raw: str, label: str) -> str:
    public_origin = raw.strip()
    if public_origin == "":
        raise RuntimeError(f"{label} is required (exact origin, e.g. https://localhost:8443)")
    parts = urlsplit(public_origin)
    origin = f"{parts.scheme}://{parts.netloc}"
    if parts.scheme not in ("http", "https") or parts.netloc == "" or origin != public_origin:
        raise RuntimeError(f"{label} must be an exact origin (scheme + host + port); got {raw!r}")
    return public_origin


@lru_cache(maxsize=1)
def public_origin() -> str:
    """Exact browser origin for cookie-auth Origin checks (fail closed)."""
    return _require_exact_origin(
        os.environ.get("UNTANGLED_PUBLIC_ORIGIN", ""),
        "UNTANGLED_PUBLIC_ORIGIN",
    )


def reset_public_origin_for_tests() -> None:
    """Drop the cached public origin so test env changes take effect."""
    public_origin.cache_clear()
