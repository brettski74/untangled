"""Pydantic schemas for auth HTTP responses (never include password_hash)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class TokenPair(BaseModel):
    """OAuth2-compatible token response plus rotating refresh token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Body for exchanging a refresh token."""

    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    """Body for revoking a refresh token."""

    refresh_token: str = Field(min_length=1)


class UserProfile(BaseModel):
    """Authenticated user profile returned by ``/auth/me``."""

    id: UUID
    username: str
    display_name: str
    is_active: bool
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class RbacProbeResponse(BaseModel):
    """Proof response for the RBAC-protected probe route."""

    ok: bool = True
    required_permission: str
    detail: str = "RBAC check passed"


class ChangePasswordRequest(BaseModel):
    """Body for identity-bound password change.

    Fields default to ``None`` so null/empty/omitted values reach the always-run
    post-auth pipeline (uniform 422) instead of required-field short-circuit.
    """

    current_password: str | None = None
    new_password: str | None = None
    verify_new_password: str | None = None


class ChangePasswordResponse(BaseModel):
    """Generic success or failure detail (never echoes password material)."""

    detail: str
