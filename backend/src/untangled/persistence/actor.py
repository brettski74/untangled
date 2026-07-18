"""Temporary identity for audit stamps until auth lands."""

from __future__ import annotations

from uuid import UUID

# Well-known UUIDv7-shaped constant used for created_by / updated_by while there
# is no authenticated principal. Replace this single import site when auth ships.
STUB_ACTOR_ID = UUID("01900000-0000-7000-8000-000000000001")
