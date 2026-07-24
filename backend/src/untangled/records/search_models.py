"""Shared hand-authored search API protocol models (class-agnostic envelopes)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from untangled.persistence.search import SearchValidationError, SortSpec

__all__ = [
    "SearchRequest",
    "SearchResponse",
    "SearchValidationError",
    "SortSpec",
]


class SearchRequest(BaseModel):
    """POST /{collection}/search body.

    ``predicate`` is a recursive tree object documented in local-development.md;
    structural validation runs in the definition-driven search compiler.
    """

    model_config = ConfigDict(extra="forbid")

    predicate: dict[str, Any] | None = None
    sort: list[SortSpec] | None = None
    attributes: list[str] | None = None
    limit: int | None = Field(default=None)
    offset: int | None = Field(default=None)


class SearchResponse(BaseModel):
    """Search result envelope."""

    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]]
    limit: int
    offset: int
    total: int
