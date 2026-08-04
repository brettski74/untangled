"""Change Request schedule ordering (operation-path validation for issue #127).

Hand-authored until class-definition cross-field codegen exists (see #143).
Do not edit generated Create/Update models for this rule.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi.exceptions import RequestValidationError

SCHEDULE_END_MSG = "must be greater than scheduled_start"


def raise_if_schedule_end_not_after_start(
    scheduled_start: datetime | None,
    scheduled_end: datetime | None,
) -> None:
    """Reject when both times are present and end is not strictly after start.

    Raises ``RequestValidationError`` so the shared handler returns HTTP 422 with
    field-attributed ``detail`` on ``scheduled_end``.
    """
    if scheduled_start is None or scheduled_end is None:
        return
    if scheduled_end > scheduled_start:
        return
    raise RequestValidationError(
        [
            {
                "type": "value_error",
                "loc": ("body", "scheduled_end"),
                "msg": SCHEDULE_END_MSG,
                "input": scheduled_end,
            }
        ]
    )


def effective_schedule_pair(
    existing: Any,
    body: Any,
) -> tuple[datetime | None, datetime | None]:
    """Resolve start/end after applying an update body to an existing row.

    Uses unset-aware body fields (datetimes) rather than ``model_dump`` so
    comparison stays typed.
    """
    fields_set = getattr(body, "model_fields_set", set())
    start = (
        getattr(body, "scheduled_start")
        if "scheduled_start" in fields_set
        else getattr(existing, "scheduled_start", None)
    )
    end = (
        getattr(body, "scheduled_end")
        if "scheduled_end" in fields_set
        else getattr(existing, "scheduled_end", None)
    )
    return start, end
