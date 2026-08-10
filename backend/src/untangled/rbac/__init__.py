"""RBAC: permission keys, DB resolution, and FastAPI enforcement helpers."""

from untangled.rbac.dependencies import (
    EffectivePermissions,
    assert_permission,
    get_effective_permissions,
    require_class_operation,
    require_permission,
)
from untangled.rbac.keys import (
    ADMIN_PERMISSION_KEY,
    OPERATIONS,
    STANDARD_OPERATIONS,
    class_operation_granted,
    class_operation_key,
    parse_permission_key,
    permission_grants,
    permission_id_for_key,
)

__all__ = [
    "ADMIN_PERMISSION_KEY",
    "OPERATIONS",
    "STANDARD_OPERATIONS",
    "EffectivePermissions",
    "assert_permission",
    "class_operation_granted",
    "class_operation_key",
    "get_effective_permissions",
    "parse_permission_key",
    "permission_grants",
    "permission_id_for_key",
    "require_class_operation",
    "require_permission",
]
