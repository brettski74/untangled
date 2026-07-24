"""Domain record HTTP helpers: shared locator resolution for friendly-id classes."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status

from untangled.mapping.definition import ClassDefinition

LocatorKind = Literal["id", "friendly"]


def classify_locator(
    definition: ClassDefinition,
    locator: str,
) -> tuple[LocatorKind, UUID | str]:
    """Classify a path locator as UUIDv7 id or friendly-id value.

    Raises HTTP 400 when the locator is neither a valid UUID nor a valid
    friendly id for this class (prefix + numeric body).
    """
    try:
        return ("id", UUID(locator))
    except ValueError:
        pass

    attr = definition.friendly_id_attr()
    if attr is None or attr.prefix is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"locator {locator!r} is not a valid UUID and class "
                f"{definition.name_kebab!r} has no friendly-id"
            ),
        )

    prefix = attr.prefix
    if (
        locator.startswith(prefix)
        and len(locator) > len(prefix)
        and locator[len(prefix) :].isdigit()
    ):
        return ("friendly", locator)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"locator {locator!r} is neither a valid id nor a valid "
            f"{prefix}… friendly id for {definition.name_kebab}"
        ),
    )
