"""Whole-second UTC datetime policy for storage and wire serialization.

Persisted / API ``datetime`` values round to the nearest second via
``require_utc_seconds`` / ``utc_now``. JWT access-token ``iat``/``exp`` are
intentionally *not* rounded with this helper: nearest-second round-up can put
``iat`` in the future and PyJWT rejects those tokens. Keep that carve-out at
the token mint site; do not “align” JWT claims onto ``utc_now``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def require_utc_seconds(value: datetime) -> datetime:
    """Require an aware datetime, convert to UTC, and round to the nearest second."""
    if value.tzinfo is None:
        raise ValueError("datetime must be timezone-aware (UTC)")
    utc = value.astimezone(timezone.utc)
    if utc.microsecond >= 500_000:
        return utc.replace(microsecond=0) + timedelta(seconds=1)
    return utc.replace(microsecond=0)


def format_utc_iso_z(value: datetime) -> str:
    """Serialize to second-precision UTC ISO-8601 with a ``Z`` suffix."""
    return require_utc_seconds(value).isoformat().replace("+00:00", "Z")


def utc_now() -> datetime:
    """Current UTC time rounded to the nearest second."""
    return require_utc_seconds(datetime.now(timezone.utc))
