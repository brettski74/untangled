"""Canonical permission key helpers (class+operation and non-class keys)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID, uuid5

# Standard operations: declaring one on a class mounts the matching generic
# record endpoint and seeds ``{class}:{op}``. Custom snake_case names may also
# appear in class YAML; they seed catalog keys but do not mount endpoints.
Operation = Literal["create", "read", "update", "delete", "search"]

STANDARD_OPERATIONS: frozenset[str] = frozenset(
    {"create", "read", "update", "delete", "search"}
)
# Back-compat alias used by older call sites / exports.
OPERATIONS: frozenset[str] = STANDARD_OPERATIONS
ADMIN_PERMISSION_KEY = "admin"

# Fixed platform namespace for deterministic permission row ids (ADR 001).
# Do not change casually: ids are derived as UUIDv5(this, canonical key).
PERMISSION_KEY_NAMESPACE = UUID("01900000-0000-7000-8000-00000000a001")


def permission_id_for_key(key: str) -> UUID:
    """Return the stable UUIDv5 primary key for a canonical permission key."""
    if not key or key != key.strip():
        raise ValueError(f"invalid permission key: {key!r}")
    return uuid5(PERMISSION_KEY_NAMESPACE, key)


def class_operation_key(class_name: str, operation: str) -> str:
    """Build the canonical ``{class}:{operation}`` permission key.

    ``operation`` may be a standard op or any other non-empty permission segment
    that does not contain ``:`` (custom class-scoped permissions).
    """
    if not class_name or ":" in class_name:
        raise ValueError(f"invalid class name for permission key: {class_name!r}")
    if not operation or ":" in operation or operation != operation.strip():
        raise ValueError(f"unsupported operation: {operation!r}")
    return f"{class_name}:{operation}"


def parse_permission_key(key: str) -> tuple[str | None, str | None]:
    """Split a key into ``(class_name, operation)``; bare keys yield ``(None, None)``.

    The canonical string remains the authority; parsed parts are derived views.
    Class-scoped keys accept any non-empty operation segment (standard or custom).
    """
    if not key or key != key.strip():
        raise ValueError(f"invalid permission key: {key!r}")
    if key == ADMIN_PERMISSION_KEY:
        return None, None
    if ":" not in key:
        return None, None
    class_name, operation = key.split(":", 1)
    if not class_name or not operation or ":" in operation:
        raise ValueError(f"invalid class+operation permission key: {key!r}")
    return class_name, operation


def permission_grants(effective: frozenset[str] | set[str], required: str) -> bool:
    """Return True if ``effective`` satisfies ``required`` (``admin`` is allow-all)."""
    if ADMIN_PERMISSION_KEY in effective:
        return True
    return required in effective


def class_operation_granted(
    effective: frozenset[str] | set[str],
    class_name: str,
    operation: str,
    *,
    public: bool = False,
) -> bool:
    """Return True if ``effective`` may perform ``operation`` on ``class_name``.

    ``public`` grants authenticated **read** and **search** without the matching
    ``{class}:{op}`` grant. Callers must still require an authenticated principal.
    Prefer ``require_class_operation``, which loads ``public`` from class metadata.
    ``public`` never grants create/update/delete.
    """
    if public and operation in ("read", "search"):
        return True
    return permission_grants(effective, class_operation_key(class_name, operation))
