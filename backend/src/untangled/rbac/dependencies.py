"""FastAPI dependencies that enforce RBAC permissions."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from psycopg import Connection

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.dependencies import CurrentUser, DbConn
from untangled.mapping.registry import class_definition
from untangled.rbac.keys import (
    class_operation_granted,
    class_operation_key,
    permission_grants,
)
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
        request: Request,
        user: CurrentUser,
        permissions: EffectivePermissions,
    ) -> dict[str, Any]:
        if not permission_grants(permissions, required):
            emit_best_effort(
                make_event(
                    event_type=EventType.RECORD_AUTHZ_DENIED,
                    actor_channel=ActorChannel.HUMAN,
                    outcome=Outcome.FAILURE,
                    reason="missing_permission",
                    severity=Severity.WARNING,
                    user_id=user["id"],
                    ip_address=client_ip(request),
                    data={"required_permission": required},
                )
            )
            raise _forbidden(f"Missing permission: {required}")
        return user

    return _dependency


def require_class_operation(
    class_name: str,
    operation: str,
) -> Callable[..., dict[str, Any]]:
    """Dependency factory: require ``{class}:{operation}`` (or ``admin`` / ``public``).

    ``class_name`` is the live class ``name``; used unaltered for permission keys
    and definition lookup. ``public`` classes grant authenticated read and search
    without the matching ``{class}:{op}`` grant.
    """

    def _dependency(
        request: Request,
        user: CurrentUser,
        permissions: EffectivePermissions,
    ) -> dict[str, Any]:
        public = False
        if operation in ("read", "search"):
            public = class_definition(class_name).public
        if not class_operation_granted(
            permissions, class_name, operation, public=public
        ):
            required = class_operation_key(class_name, operation)
            emit_best_effort(
                make_event(
                    event_type=EventType.RECORD_AUTHZ_DENIED,
                    actor_channel=ActorChannel.HUMAN,
                    outcome=Outcome.FAILURE,
                    reason="missing_class_operation",
                    severity=Severity.WARNING,
                    user_id=user["id"],
                    ip_address=client_ip(request),
                    data={
                        "class": class_name,
                        "operation": operation,
                        "required_permission": required,
                    },
                )
            )
            raise _forbidden(f"Missing permission: {required}")
        return user

    return _dependency


def assert_permission(
    conn: Connection,
    user_id: UUID,
    required: str,
) -> None:
    """Raise HTTP 403 if ``user_id`` lacks ``required`` (and is not admin)."""
    if not user_has_permission(conn, user_id, required):
        raise _forbidden(f"Missing permission: {required}")
