"""Hand-authored v1 read-protocol models for FK identity enrichment."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from untangled.persistence.fk_enrichment import RelatedIdentity
from untangled.records.search_models import SearchResponse


class FkIdentity(BaseModel):
    """Wire identity object for a non-null foreign key on ``/api/v1`` reads."""

    model_config = ConfigDict(extra="forbid")

    id: str
    # Present iff the target class has an effective display attribute.
    display_name: str | None = None
    # Present iff the target class has a friendly-id attribute.
    friendly_id: str | None = None


class V1SearchResponse(SearchResponse):
    """Search envelope for ``/api/v1`` (items may nest ``FkIdentity`` objects)."""

    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]] = Field(
        description=(
            "Projected rows. Foreign-key fields are FkIdentity objects or null; "
            "non-FK values remain scalars."
        )
    )


def related_identity_to_wire(value: RelatedIdentity) -> dict[str, Any]:
    """Convert a neutral RelatedIdentity into the v1 wire object."""
    out: dict[str, Any] = {"id": str(value.id)}
    if value.has_display:
        out["display_name"] = value.display_value
    if value.has_friendly:
        out["friendly_id"] = value.friendly_value
    return out


def serialize_v1_record(record: dict[str, Any]) -> dict[str, Any]:
    """Map persistence enriched row values to v1 wire shapes."""
    out: dict[str, Any] = {}
    for key, value in record.items():
        if isinstance(value, RelatedIdentity):
            out[key] = related_identity_to_wire(value)
        else:
            out[key] = value
    return out


def serialize_v1_search_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map enriched search items to v1 wire shapes."""
    return [serialize_v1_record(item) for item in items]
