"""Temporary identity for audit stamps until HTTP handlers pass a real principal.

Aligned with the seeded admin user UUID so audit FKs to ``user.id`` remain valid
for library/test paths that are not yet HTTP-authenticated.
"""

from __future__ import annotations

from uuid import UUID

# Well-known UUIDv7-shaped constant — same as seed admin (`untangled.seed.users`).
STUB_ACTOR_ID = UUID("01900000-0000-7000-8000-000000000001")
