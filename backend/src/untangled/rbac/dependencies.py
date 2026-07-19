"""FastAPI dependencies that enforce RBAC permissions."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from psycopg import Connection

from untangled.auth.dependencies import CurrentUser, DbConn
from untangled.rbac.keys import class_operation_key, permission_grants
from untangled.rbac.store import fetch_effective_permission_keys, user_has_permission


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def get_effective_permissions(
    user: CurrentUser,
    conn: DbConn,
) -> frozenset[str]:
    """Resolve effective permission keys for the authenticated user (DB per request)."""
    return fetch_effective_permission_keys(conn, user["id"])


EffectivePermissions = Annotated[frozenset[str], Depends(get_effective_permissions)]


def require_permission(required: str) -> Callable[..., dict[str, Any]]:
    """Dependency factory: require ``required`` (or ``admin`` allow-all)."""

    def _dependency(
        user: CurrentUser,
        permissions: EffectivePermissions,
    ) -> dict[str, Any]:
        if not permission_grants(permissions, required):
            raise _forbidden(f"Missing permission: {required}")
        return user

    return _dependency


def require_class_operation(
    class_kebab: str,
    operation: str,
) -> Callable[..., dict[str, Any]]:
    """Dependency factory: require ``{class}:{operation}`` (or ``admin``)."""
    return require_permission(class_operation_key(class_kebab, operation))


def assert_permission(
    conn: Connection,
    user_id: UUID,
    required: str,
) -> None:
    """Raise HTTP 403 if ``user_id`` lacks ``required`` (and is not admin)."""
    if not user_has_permission(conn, user_id, required):
        raise _forbidden(f"Missing permission: {required}")
