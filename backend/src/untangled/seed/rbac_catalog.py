"""Stable RBAC seed catalog: roles, permissions, and join attachments."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from untangled.mapping.registry import definitions_by_name
from untangled.rbac.keys import (
    ADMIN_PERMISSION_KEY,
    class_operation_key,
    permission_id_for_key,
)
from untangled.seed.users import (
    SEED_ADMIN_ID,
    SEED_CHANGE_ID,
    SEED_INCIDENT_ID,
    SEED_READONLY_ID,
    SEED_READWRITE_ID,
)

# Keys that the pre-#185 hard-coded seed matrix produced. Obsolete cleanup may
# remove these when absent from the YAML-derived catalog; never delete other keys.
LEGACY_SEEDED_PERMISSION_CLASSES: tuple[str, ...] = (
    "demo_item",
    "incident",
    "change_request",
)
LEGACY_SEEDED_OPERATIONS: tuple[str, ...] = ("create", "delete", "read", "update")


SEED_ROLE_ADMIN_ID = UUID("01900000-0000-7000-8000-000000000011")
SEED_ROLE_READ_ONLY_ID = UUID("01900000-0000-7000-8000-000000000012")
SEED_ROLE_READ_WRITE_ID = UUID("01900000-0000-7000-8000-000000000013")
SEED_ROLE_CHANGE_REQUEST_READ_WRITE_ID = UUID(
    "01900000-0000-7000-8000-000000000014"
)
SEED_ROLE_INCIDENT_READ_ONLY_ID = UUID("01900000-0000-7000-8000-000000000015")


@dataclass(frozen=True, slots=True)
class SeedRole:
    id: UUID
    name: str
    display_name: str


SEED_ROLES: tuple[SeedRole, ...] = (
    SeedRole(id=SEED_ROLE_ADMIN_ID, name="admin", display_name="Administrator"),
    SeedRole(id=SEED_ROLE_READ_ONLY_ID, name="read_only", display_name="Read Only"),
    SeedRole(
        id=SEED_ROLE_READ_WRITE_ID,
        name="read_write",
        display_name="Read Write",
    ),
    SeedRole(
        id=SEED_ROLE_CHANGE_REQUEST_READ_WRITE_ID,
        name="change_request_read_write",
        display_name="Change Request Read Write",
    ),
    SeedRole(
        id=SEED_ROLE_INCIDENT_READ_ONLY_ID,
        name="incident_read_only",
        display_name="Incident Read Only",
    ),
)


@dataclass(frozen=True, slots=True)
class SeedPermission:
    id: UUID
    key: str
    class_name: str | None
    operation: str | None


def _legacy_seed_permission_keys() -> frozenset[str]:
    keys = {ADMIN_PERMISSION_KEY}
    for class_name in LEGACY_SEEDED_PERMISSION_CLASSES:
        for operation in LEGACY_SEEDED_OPERATIONS:
            keys.add(class_operation_key(class_name, operation))
    return frozenset(keys)


LEGACY_SEED_PERMISSION_KEYS: frozenset[str] = _legacy_seed_permission_keys()


def build_permission_catalog_from_definitions() -> tuple[SeedPermission, ...]:
    """Derive class-scoped permission rows from loaded class YAML + ``admin``."""
    items: list[SeedPermission] = [
        SeedPermission(
            id=permission_id_for_key(ADMIN_PERMISSION_KEY),
            key=ADMIN_PERMISSION_KEY,
            class_name=None,
            operation=None,
        )
    ]
    for definition in sorted(
        definitions_by_name().values(), key=lambda d: d.name_snake
    ):
        for permission_name in definition.permissions:
            key = class_operation_key(definition.name_snake, permission_name)
            items.append(
                SeedPermission(
                    id=permission_id_for_key(key),
                    key=key,
                    class_name=definition.name_snake,
                    operation=permission_name,
                )
            )
    return tuple(items)


def seed_permissions() -> tuple[SeedPermission, ...]:
    """Return the current seed permission catalog (lazy over class definitions)."""
    return build_permission_catalog_from_definitions()


def seed_permissions_by_key() -> dict[str, SeedPermission]:
    return {p.key: p for p in seed_permissions()}


# Product ticket / demo classes that seed roles historically covered.
_SEED_ROLE_CLASSES: tuple[str, ...] = ("demo_item", "incident", "change_request")


@dataclass(frozen=True, slots=True)
class SeedRolePermission:
    id: UUID
    role_id: UUID
    permission_key: str


def _join_id(ordinal: int) -> UUID:
    if not 0 <= ordinal <= 0xFF:
        raise ValueError(f"join ordinal out of range: {ordinal}")
    return UUID(f"01900000-0000-7000-8000-0000000002{ordinal:02x}")


def _role_permission_keys(role_name: str) -> tuple[str, ...]:
    if role_name == "admin":
        return (ADMIN_PERMISSION_KEY,)
    if role_name == "read_only":
        keys: list[str] = []
        for class_name in _SEED_ROLE_CLASSES:
            keys.append(class_operation_key(class_name, "read"))
            keys.append(class_operation_key(class_name, "search"))
        return tuple(keys)
    if role_name == "read_write":
        keys = []
        for class_name in _SEED_ROLE_CLASSES:
            for operation in ("create", "read", "search", "update"):
                keys.append(class_operation_key(class_name, operation))
        return tuple(keys)
    if role_name == "change_request_read_write":
        return tuple(
            class_operation_key("change_request", operation)
            for operation in ("create", "read", "search", "update")
        )
    if role_name == "incident_read_only":
        return (
            class_operation_key("incident", "read"),
            class_operation_key("incident", "search"),
        )
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
    SeedUserRole(
        id=_join_id(0x83),
        user_id=SEED_CHANGE_ID,
        role_id=SEED_ROLE_CHANGE_REQUEST_READ_WRITE_ID,
    ),
    SeedUserRole(
        id=_join_id(0x84),
        user_id=SEED_INCIDENT_ID,
        role_id=SEED_ROLE_INCIDENT_READ_ONLY_ID,
    ),
)
