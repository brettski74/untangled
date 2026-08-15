"""Auth HTTP routes: legacy unversioned logout, ``/auth/me``, change-password, RBAC probe."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, emit_fail_closed, make_event
from untangled.audit.file_sink import AuditWriteError
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.auth.dependencies import CurrentUser, DbConn, PasswordChangeSubject
from untangled.auth.password_change import change_password
from untangled.auth.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    LogoutRequest,
    RbacProbeResponse,
    UserProfile,
)
from untangled.auth.store import (
    refresh_token_is_active,
    revoke_refresh_token,
    update_user_password_hash,
)
from untangled.rbac.dependencies import require_class_operation
from untangled.rbac.keys import class_operation_key
from untangled.rbac.store import (
    fetch_effective_permission_keys,
    fetch_role_names_for_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_LOG = logging.getLogger("untangled.audit")

_DEMO_ITEM_READ = class_operation_key("demo_item", "read")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, body: LogoutRequest, conn: DbConn) -> None:
    """Revoke the presented refresh token (idempotent if already revoked/unknown)."""
    ip = client_ip(request)
    active = refresh_token_is_active(conn, body.refresh_token)
    if not active:
        emit_best_effort(
            make_event(
                event_type=EventType.AUTH_LOGOUT,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="logout_idempotent",
                severity=Severity.INFO,
                ip_address=ip,
            )
        )
        return
    try:
        emit_fail_closed(
            make_event(
                event_type=EventType.AUTH_LOGOUT,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="logout_revoke",
                severity=Severity.INFO,
                ip_address=ip,
            )
        )
    except AuditWriteError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Audit logging failed",
        ) from exc
    revoke_refresh_token(conn, body.refresh_token)


@router.get("/me", response_model=UserProfile)
def me(user: CurrentUser, conn: DbConn) -> UserProfile:
    """Return the authenticated user's non-secret profile plus RBAC context."""
    roles = fetch_role_names_for_user(conn, user["id"])
    permissions = sorted(fetch_effective_permission_keys(conn, user["id"]))
    return UserProfile(
        id=user["id"],
        username=user["username"],
        display_name=user["display_name"],
        is_active=user["is_active"],
        roles=roles,
        permissions=permissions,
    )


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password_route(
    request: Request,
    body: ChangePasswordRequest,
    user: PasswordChangeSubject,
    conn: DbConn,
) -> ChangePasswordResponse:
    """Identity-bound self-service password change (not class RBAC).

    Missing/invalid Bearer → 401 (dependency). Post-auth pipeline failures →
    uniform 422 with a generic message; success → 200.
    """
    ip = client_ip(request)
    prior_hash = user["password_hash"]
    ok, detail = change_password(
        conn,
        user,
        current_password=body.current_password,
        new_password=body.new_password,
        verify_new_password=body.verify_new_password,
    )
    if not ok:
        emit_best_effort(
            make_event(
                event_type=EventType.AUTH_PASSWORD_CHANGE,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.FAILURE,
                reason="password_change_failed",
                severity=Severity.WARNING,
                user_id=user["id"],
                ip_address=ip,
            )
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail,
        )
    try:
        emit_fail_closed(
            make_event(
                event_type=EventType.AUTH_PASSWORD_CHANGE,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="password_change_ok",
                severity=Severity.NOTICE,
                user_id=user["id"],
                ip_address=ip,
            )
        )
    except AuditWriteError as exc:
        update_user_password_hash(conn, user["id"], prior_hash, actor_id=user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Audit logging failed",
        ) from exc
    return ChangePasswordResponse(detail=detail)


@router.get("/rbac-probe", response_model=RbacProbeResponse)
def rbac_probe(
    _user: Annotated[dict[str, Any], Depends(require_class_operation("demo_item", "read"))],
) -> RbacProbeResponse:
    """RBAC proof route: requires ``demo-item:read`` (or ``admin`` allow-all)."""
    return RbacProbeResponse(required_permission=_DEMO_ITEM_READ)
