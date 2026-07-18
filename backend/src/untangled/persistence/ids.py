"""UUIDv7 generation (stdlib on 3.13+; pure-Python fallback for 3.12)."""

from __future__ import annotations

import os
import time
import uuid
from uuid import UUID


def new_uuid7() -> UUID:
    """Return a new time-ordered UUIDv7."""
    factory = getattr(uuid, "uuid7", None)
    if factory is not None:
        return factory()
    return _uuid7_fallback()


def _uuid7_fallback() -> UUID:
    """RFC 9562 UUIDv7 for runtimes without ``uuid.uuid7`` (Python < 3.13)."""
    # 48-bit Unix epoch milliseconds
    unix_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    # 74 bits of randomness (12 + 62) after version/variant nibble layout
    rand_bytes = os.urandom(10)
    rand_a = int.from_bytes(rand_bytes[:2], "big") & 0x0FFF
    rand_b = int.from_bytes(rand_bytes[2:], "big") & 0x3FFFFFFFFFFFFFFF

    value = (unix_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    return UUID(int=value)
