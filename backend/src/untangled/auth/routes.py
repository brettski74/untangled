"""Auth HTTP routes: login, refresh, logout, ``/auth/me``, and RBAC probe."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from untangled.auth.dependencies import CurrentUser, DbConn
from untangled.auth.schemas import (
    LogoutRequest,
    RbacProbeResponse,
    RefreshRequest,
    TokenPair,
    UserProfile,
)
from untangled.auth.store import (
    authenticate_user,
    issue_token_pair,
    revoke_refresh_token,
    rotate_refresh_token,
)
from untangled.rbac.dependencies import require_class_operation
from untangled.rbac.keys import class_operation_key
from untangled.rbac.store import (
    fetch_effective_permission_keys,
    fetch_role_names_for_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid username or password",
    headers={"WWW-Authenticate": "Bearer"},
)

_DEMO_ITEM_READ = class_operation_key("demo-item", "read")


@router.post("/login", response_model=TokenPair)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    conn: DbConn,
) -> TokenPair:
    """Username/password login (OAuth2 password form for Swagger Authorize)."""
    user = authenticate_user(conn, form.username, form.password)
    if user is None:
        raise _INVALID_CREDENTIALS
    access, refresh = issue_token_pair(conn, user["id"])
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, conn: DbConn) -> TokenPair:
    """Exchange a valid refresh token for a new access + refresh pair (rotation)."""
    pair = rotate_refresh_token(conn, body.refresh_token)
    if pair is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    access, refresh_token = pair
    return TokenPair(access_token=access, refresh_token=refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, conn: DbConn) -> None:
    """Revoke the presented refresh token (idempotent if already revoked/unknown)."""
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


@router.get("/rbac-probe", response_model=RbacProbeResponse)
def rbac_probe(
    _user: Annotated[dict[str, Any], Depends(require_class_operation("demo-item", "read"))],
) -> RbacProbeResponse:
    """RBAC proof route: requires ``demo-item:read`` (or ``admin`` allow-all)."""
    return RbacProbeResponse(required_permission=_DEMO_ITEM_READ)
