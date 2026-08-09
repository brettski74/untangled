"""Redis URL from environment (host local-dev default; Compose overrides)."""

from __future__ import annotations

import os

# Matches compose/host docs. Override with UNTANGLED_REDIS_URL in any env.
# Unset → host local-dev default only; production-capable deploys must set an
# explicit URL (empty string fails closed — do not rely on localhost silently).
DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0"


class RedisConfigError(RuntimeError):
    """Invalid or unusable Redis configuration."""


def redis_url() -> str:
    """Return Redis URL from ``UNTANGLED_REDIS_URL`` or the documented host default.

    An explicitly empty ``UNTANGLED_REDIS_URL`` is a configuration error (fail
    closed for bus-dependent paths that call this helper).
    """
    raw = os.environ.get("UNTANGLED_REDIS_URL")
    if raw is None:
        return DEFAULT_REDIS_URL
    stripped = raw.strip()
    if stripped == "":
        raise RedisConfigError(
            "UNTANGLED_REDIS_URL is set but empty; set a redis:// URL or unset "
            "the variable to use the host default"
        )
    return stripped
