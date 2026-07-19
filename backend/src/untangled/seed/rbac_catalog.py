"""Stable RBAC seed catalog: roles, permissions, and join attachments."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from untangled.rbac.keys import ADMIN_PERMISSION_KEY, OPERATIONS, class_operation_key
from untangled.seed.users import SEED_ADMIN_ID, SEED_READONLY_ID, SEED_READWRITE_ID

# Seeded YAML class names that receive a full CRUD permission catalog in M1.
# Pre-seeding incident / change-request keys does not create those domain tables.
SEEDED_PERMISSION_CLASSES: tuple[str, ...] = (
    "demo-item",
    "incident",
    "change-request",
)

SEED_ROLE_ADMIN_ID = UUID("01900000-0000-7000-8000-000000000011")
SEED_ROLE_READ_ONLY_ID = UUID("01900000-0000-7000-8000-000000000012")
SEED_ROLE_READ_WRITE_ID = UUID("01900000-0000-7000-8000-000000000013")


@dataclass(frozen=True, slots=True)
class SeedRole:
    id: UUID
    name: str
    display_name: str


SEED_ROLES: tuple[SeedRole, ...] = (
    SeedRole(id=SEED_ROLE_ADMIN_ID, name="admin", display_name="Administrator"),
    SeedRole(id=SEED_ROLE_READ_ONLY_ID, name="read-only", display_name="Read Only"),
    SeedRole(
        id=SEED_ROLE_READ_WRITE_ID,
        name="read-write",
        display_name="Read Write",
    ),
)


@dataclass(frozen=True, slots=True)
class SeedPermission:
    id: UUID
    key: str
    class_name: str | None
    operation: str | None


def _permission_id(ordinal: int) -> UUID:
    """Stable UUIDv7-shaped id in the reserved seed block (…000100 + ordinal)."""
    if not 0 <= ordinal <= 0xFF:
        raise ValueError(f"permission ordinal out of range: {ordinal}")
    return UUID(f"01900000-0000-7000-8000-0000000001{ordinal:02x}")


def _build_permission_catalog() -> tuple[SeedPermission, ...]:
    items: list[SeedPermission] = [
        SeedPermission(
            id=_permission_id(0),
            key=ADMIN_PERMISSION_KEY,
            class_name=None,
            operation=None,
        )
    ]
    ordinal = 1
    for class_name in SEEDED_PERMISSION_CLASSES:
        for operation in sorted(OPERATIONS):
            items.append(
                SeedPermission(
                    id=_permission_id(ordinal),
                    key=class_operation_key(class_name, operation),
                    class_name=class_name,
                    operation=operation,
                )
            )
            ordinal += 1
    return tuple(items)


SEED_PERMISSIONS: tuple[SeedPermission, ...] = _build_permission_catalog()
SEED_PERMISSIONS_BY_KEY: dict[str, SeedPermission] = {p.key: p for p in SEED_PERMISSIONS}


def _join_id(ordinal: int) -> UUID:
    if not 0 <= ordinal <= 0xFF:
        raise ValueError(f"join ordinal out of range: {ordinal}")
    return UUID(f"01900000-0000-7000-8000-0000000002{ordinal:02x}")


@dataclass(frozen=True, slots=True)
class SeedRolePermission:
    id: UUID
    role_id: UUID
    permission_key: str


def _role_permission_keys(role_name: str) -> tuple[str, ...]:
    if role_name == "admin":
        return (ADMIN_PERMISSION_KEY,)
    if role_name == "read-only":
        return tuple(
            class_operation_key(class_name, "read")
            for class_name in SEEDED_PERMISSION_CLASSES
        )
    if role_name == "read-write":
        keys: list[str] = []
        for class_name in SEEDED_PERMISSION_CLASSES:
            for operation in ("create", "read", "update"):
                keys.append(class_operation_key(class_name, operation))
        return tuple(keys)
    raise ValueError(f"unknown seed role: {role_name!r}")


def _build_role_permissions() -> tuple[SeedRolePermission, ...]:
    items: list[SeedRolePermission] = []
    ordinal = 0
    for role in SEED_ROLES:
        for key in _role_permission_keys(role.name):
            items.append(
                SeedRolePermission(
                    id=_join_id(ordinal),
                    role_id=role.id,
                    permission_key=key,
                )
            )
            ordinal += 1
    return tuple(items)


SEED_ROLE_PERMISSIONS: tuple[SeedRolePermission, ...] = _build_role_permissions()


@dataclass(frozen=True, slots=True)
class SeedUserRole:
    id: UUID
    user_id: UUID
    role_id: UUID


SEED_USER_ROLES: tuple[SeedUserRole, ...] = (
    SeedUserRole(
        id=_join_id(0x80),
        user_id=SEED_ADMIN_ID,
        role_id=SEED_ROLE_ADMIN_ID,
    ),
    SeedUserRole(
        id=_join_id(0x81),
        user_id=SEED_READONLY_ID,
        role_id=SEED_ROLE_READ_ONLY_ID,
    ),
    SeedUserRole(
        id=_join_id(0x82),
        user_id=SEED_READWRITE_ID,
        role_id=SEED_ROLE_READ_WRITE_ID,
    ),
)
