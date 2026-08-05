"""Canonical permission key helpers (class+operation and non-class keys)."""

from __future__ import annotations

from typing import Literal

Operation = Literal["create", "read", "update", "delete"]

OPERATIONS: frozenset[str] = frozenset({"create", "read", "update", "delete"})
ADMIN_PERMISSION_KEY = "admin"


def class_operation_key(class_kebab: str, operation: str) -> str:
    """Build the canonical ``{class}:{operation}`` permission key."""
    if not class_kebab or ":" in class_kebab:
        raise ValueError(f"invalid class name for permission key: {class_kebab!r}")
    if operation not in OPERATIONS:
        raise ValueError(f"unsupported operation: {operation!r}")
    return f"{class_kebab}:{operation}"


def parse_permission_key(key: str) -> tuple[str | None, str | None]:
    """Split a key into ``(class_name, operation)``; bare keys yield ``(None, None)``.

    The canonical string remains the authority; parsed parts are derived views.
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
    if operation not in OPERATIONS:
        raise ValueError(f"unsupported operation in permission key: {key!r}")
    return class_name, operation


def permission_grants(effective: frozenset[str] | set[str], required: str) -> bool:
    """Return True if ``effective`` satisfies ``required`` (``admin`` is allow-all)."""
    if ADMIN_PERMISSION_KEY in effective:
        return True
    return required in effective


def class_operation_granted(
    effective: frozenset[str] | set[str],
    class_kebab: str,
    operation: str,
    *,
    public: bool = False,
) -> bool:
    """Return True if ``effective`` may perform ``operation`` on ``class_kebab``.

    ``public`` grants authenticated **read** without ``{class}:read``. Callers
    must still require an authenticated principal. Prefer
    ``require_class_operation``, which loads ``public`` from class metadata.
    """
    if operation == "read" and public:
        return True
    return permission_grants(effective, class_operation_key(class_kebab, operation))
