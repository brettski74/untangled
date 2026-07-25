"""Central 400/422 classification for client-input validation failures.

Taxonomy (issue #56): structural / envelope problems → 400; semantic / value /
domain problems → 422. Application-raised search failures use the same rule via
``SearchStructuralError`` / ``SearchSemanticError`` in
``untangled.persistence.search`` — keep those subclasses aligned with the
structural set below when adding new cases.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Pydantic / FastAPI error ``type`` values treated as structural (envelope /
# shape / unrecognized keys / missing required children). Scalar parse/type
# mismatches, enums, ranges, and similar stay off this set → 422.
STRUCTURAL_VALIDATION_TYPES: frozenset[str] = frozenset(
    {
        "missing",
        "extra_forbidden",
        "json_invalid",
        "model_attributes_type",
        "model_type",
        "dict_type",
        "list_type",
        "tuple_type",
        "set_type",
        "frozenset_type",
    }
)

HTTP_400 = status.HTTP_400_BAD_REQUEST
HTTP_422 = status.HTTP_422_UNPROCESSABLE_CONTENT


def is_structural_validation_error(error: Mapping[str, Any]) -> bool:
    """True when a single Pydantic/FastAPI error dict is structural."""
    return error.get("type") in STRUCTURAL_VALIDATION_TYPES


def status_for_validation_errors(errors: Sequence[Mapping[str, Any]]) -> int:
    """Map a validation error set to HTTP status: any structural → 400, else 422."""
    if any(is_structural_validation_error(err) for err in errors):
        return HTTP_400
    return HTTP_422


async def request_validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Reclassify FastAPI request validation; preserve default ``detail`` shape."""
    errors = exc.errors()
    return JSONResponse(
        status_code=status_for_validation_errors(errors),
        content={"detail": jsonable_encoder(errors)},
    )


def register_request_validation_handlers(app: FastAPI) -> None:
    """Install the shared validation reclassifier on ``app``."""
    app.add_exception_handler(
        RequestValidationError,
        request_validation_exception_handler,
    )
