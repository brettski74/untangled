"""Shared hand-authored search API protocol models (class-agnostic envelopes)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from untangled.persistence.search import (
    SearchStructuralError,
    SearchValidationError,
    SortDirection,
)

__all__ = [
    "SearchRequest",
    "SearchResponse",
    "SearchStructuralError",
    "SearchValidationError",
    "SortDirection",
    "SortSpec",
]


class SortSpec(BaseModel):
    """One sort key in caller order (wire protocol)."""

    model_config = ConfigDict(extra="forbid")

    attribute: str
    # ``None`` is accepted on the wire (OpenAPI nullable) and means the same as omit → ``asc``.
    direction: SortDirection | None = "asc"

    @field_validator("direction", mode="before")
    @classmethod
    def null_means_asc(cls, value: object) -> object:
        """Explicit JSON null is equivalent to omitting direction (default asc)."""
        if value is None:
            return "asc"
        return value


class SearchRequest(BaseModel):
    """POST /{collection}/search body.

    ``predicate`` is a recursive tree object documented in local-development.md;
    structural validation runs in the definition-driven search compiler.
    """

    model_config = ConfigDict(extra="forbid")

    predicate: dict[str, Any] | None = None
    sort: list[SortSpec] | None = None
    attributes: list[str] | None = None
    # Bounds also enforced in the search compiler for non-HTTP callers.
    limit: int | None = Field(default=None, ge=1, le=200)
    offset: int | None = Field(default=None, ge=0)


class SearchResponse(BaseModel):
    """Search result envelope."""

    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]]
    limit: int
    offset: int
    total: int
