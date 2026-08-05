"""Stable seed user identities for local development."""

from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID

SEED_ADMIN_ID = UUID("01900000-0000-7000-8000-000000000001")
SEED_READONLY_ID = UUID("01900000-0000-7000-8000-000000000002")
SEED_READWRITE_ID = UUID("01900000-0000-7000-8000-000000000003")
SEED_CHANGE_ID = UUID("01900000-0000-7000-8000-000000000004")
SEED_INCIDENT_ID = UUID("01900000-0000-7000-8000-000000000005")


@dataclass(frozen=True, slots=True)
class SeedUser:
    """One intentional seed principal with a matching RBAC role attachment."""

    id: UUID
    username: str
    display_name: str
    password_env: str
    default_password: str
    intent: str


SEED_USERS: tuple[SeedUser, ...] = (
    SeedUser(
        id=SEED_ADMIN_ID,
        username="admin",
        display_name="Local Admin",
        password_env="SEED_ADMIN_PASSWORD",
        default_password="admin-change-me",
        intent="admin role (allow-all via admin permission)",
    ),
    SeedUser(
        id=SEED_READONLY_ID,
        username="readonly",
        display_name="Local Read-Only",
        password_env="SEED_READONLY_PASSWORD",
        default_password="readonly-change-me",
        intent="read-only role ({class}:read for seeded classes)",
    ),
    SeedUser(
        id=SEED_READWRITE_ID,
        username="readwrite",
        display_name="Local Read-Write",
        password_env="SEED_READWRITE_PASSWORD",
        default_password="readwrite-change-me",
        intent="read-write role (create/read/update; no delete/admin)",
    ),
    SeedUser(
        id=SEED_CHANGE_ID,
        username="change",
        display_name="Local Change Operator",
        password_env="SEED_CHANGE_PASSWORD",
        default_password="change-change-me",
        intent="change-request-read-write (CHG create/read/update only)",
    ),
    SeedUser(
        id=SEED_INCIDENT_ID,
        username="incident",
        display_name="Local Incident Reader",
        password_env="SEED_INCIDENT_PASSWORD",
        default_password="incident-change-me",
        intent="incident-read-only (incident:read only)",
    ),
)


def password_for(seed: SeedUser) -> str:
    """Return env override or documented default password for ``seed``."""
    return os.environ.get(seed.password_env, seed.default_password)
