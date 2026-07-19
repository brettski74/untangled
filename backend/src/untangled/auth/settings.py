"""Auth settings from environment (local Compose defaults for development only)."""

from __future__ import annotations

import os


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def jwt_secret() -> str:
    """HMAC signing secret for access tokens (dev default is not production-grade)."""
    return os.environ.get(
        "UNTANGLED_JWT_SECRET",
        "local-dev-only-change-me-untangled-jwt-secret",
    )


def access_token_ttl_seconds() -> int:
    """Access token lifetime in seconds (default 15 minutes)."""
    return _int_env("UNTANGLED_ACCESS_TOKEN_TTL_SECONDS", 15 * 60)


def refresh_token_ttl_seconds() -> int:
    """Refresh token lifetime in seconds (default 7 days)."""
    return _int_env("UNTANGLED_REFRESH_TOKEN_TTL_SECONDS", 7 * 24 * 60 * 60)
