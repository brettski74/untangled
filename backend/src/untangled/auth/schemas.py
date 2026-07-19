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
