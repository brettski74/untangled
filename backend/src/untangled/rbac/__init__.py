"""RBAC: permission keys, DB resolution, Redis cache, and FastAPI helpers.

Role composition is union-only and directional (parent includes children; a child
does not include its parent or siblings). See ``store`` module docstring and
``sql/effective_permissions.sql``. Auth ``/api/v2/auth/me`` loads the same SQL.
"""

from untangled.rbac.cache import (
    AUTHZ_CACHE_TTL_SECONDS,
    AUTHZ_USER_KEY_PREFIX,
    fetch_effective_permission_keys_cached,
    invalidate_user_authz_cache,
)
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
from untangled.rbac.store import (
    MAX_ROLE_GRAPH_DEPTH,
    RoleGraphError,
    bump_global_authz_version,
    fetch_effective_permission_keys,
    fetch_global_authz_version,
)

__all__ = [
    "ADMIN_PERMISSION_KEY",
    "AUTHZ_CACHE_TTL_SECONDS",
    "AUTHZ_USER_KEY_PREFIX",
    "MAX_ROLE_GRAPH_DEPTH",
    "OPERATIONS",
    "STANDARD_OPERATIONS",
    "EffectivePermissions",
    "RoleGraphError",
    "assert_permission",
    "bump_global_authz_version",
    "class_operation_granted",
    "class_operation_key",
    "fetch_effective_permission_keys",
    "fetch_effective_permission_keys_cached",
    "fetch_global_authz_version",
    "get_effective_permissions",
    "invalidate_user_authz_cache",
    "parse_permission_key",
    "permission_grants",
    "permission_id_for_key",
    "require_class_operation",
    "require_permission",
]
