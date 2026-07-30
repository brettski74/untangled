"""Factory for class CRUD routers (Incident, Change Request, …)."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from untangled.auth.dependencies import DbConn
from untangled.rbac.dependencies import require_class_operation
from untangled.records.deps import class_definition, fetch_by_locator, model, record_store
from untangled.records.read_protocol import (
    V1SearchResponse,
    serialize_v1_record,
    serialize_v1_search_items,
)
from untangled.records.search_models import (
    SearchRequest,
    SearchResponse,
    SearchStructuralError,
    SearchValidationError,
)

ApiSurface = Literal["legacy", "v1"]


def build_class_router(
    *,
    class_kebab: str,
    prefix: str,
    tags: list[str],
    surface: ApiSurface = "legacy",
) -> APIRouter:
    """Build authenticated routes for a class.

    ``legacy``: full CRUD + scalar fetch/search (pre-versioning compatibility).
    ``v1``: fetch + search only, with FK identity enrichment.
    """
    create_cls: type[BaseModel] = model(class_kebab, "Create")
    update_cls: type[BaseModel] = model(class_kebab, "Update")
    router = APIRouter(prefix=prefix, tags=tags)
    enrich = surface == "v1"
    deprecated = surface == "legacy"

    if surface == "legacy":

        @router.post("", status_code=status.HTTP_201_CREATED)
        def create_record(
            body: create_cls,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_kebab, "create"))
            ],
        ) -> Any:
            store = record_store(conn, class_kebab, actor_id=user["id"])
            return store.create(body.model_dump())

    search_response_model = V1SearchResponse if enrich else SearchResponse
    search_deprecated = deprecated
    search_summary = (
        "Search records (legacy scalar FK responses)"
        if surface == "legacy"
        else "Search records with FK identity enrichment"
    )
    search_description = (
        "Pre-versioning compatibility route. Foreign-key fields are scalar UUID "
        "strings. Prefer POST /api/v1{prefix}/search for new consumers. Removal "
        "is tracked by GitHub issue #117."
        if surface == "legacy"
        else (
            "Versioned search. Projected foreign-key fields are identity objects "
            "with canonical id plus configured display_name / friendly_id. "
            "Create/update/delete remain on unversioned routes until deliberately "
            "versioned."
        )
    )

    @router.post(
        "/search",
        response_model=search_response_model,
        summary=search_summary,
        description=search_description,
        deprecated=search_deprecated,
        operation_id=f"{class_kebab.replace('-', '_')}_{surface}_search",
    )
    def search_records(
        body: SearchRequest,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_kebab, "read"))
        ],
    ) -> SearchResponse | V1SearchResponse:
        store = record_store(conn, class_kebab, actor_id=user["id"])
        sort_keys = (
            [
                (
                    spec.attribute,
                    "asc" if spec.direction is None else spec.direction,
                )
                for spec in body.sort
            ]
            if body.sort is not None
            else None
        )
        try:
            result = store.search(
                predicate=body.predicate,
                sort=sort_keys,
                attributes=body.attributes,
                limit=body.limit,
                offset=body.offset,
                enrich_fk_identity=enrich,
            )
        except SearchStructuralError as exc:
            # Structural taxonomy aligned with request_validation (issue #56).
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        except SearchValidationError as exc:
            # Semantic/value/domain failures (limit/offset range, unknown
            # attribute/op, invalid typed values, nesting guardrails, …).
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        items = (
            serialize_v1_search_items(result.items) if enrich else result.items
        )
        response_cls = V1SearchResponse if enrich else SearchResponse
        return response_cls(
            items=items,
            limit=result.limit,
            offset=result.offset,
            total=result.total,
        )

    fetch_summary = (
        "Fetch one record (legacy scalar FK responses)"
        if surface == "legacy"
        else "Fetch one record with FK identity enrichment"
    )
    fetch_description = (
        "Pre-versioning compatibility route. Foreign-key fields are scalar UUID "
        "strings. Prefer GET /api/v1{prefix}/{locator} for new consumers. Removal "
        "is tracked by GitHub issue #117."
        if surface == "legacy"
        else (
            "Versioned fetch. All foreign-key fields (including audit created_by / "
            "updated_by) are identity objects. Writes remain on unversioned routes."
        )
    )

    @router.get(
        "/{locator}",
        summary=fetch_summary,
        description=fetch_description,
        deprecated=deprecated,
        operation_id=f"{class_kebab.replace('-', '_')}_{surface}_fetch",
    )
    def fetch_record(
        locator: str,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_kebab, "read"))
        ],
    ) -> Any:
        definition = class_definition(class_kebab)
        store = record_store(conn, class_kebab, actor_id=user["id"])
        row = fetch_by_locator(
            store, definition, locator, enrich_fk_identity=enrich
        )
        if enrich:
            assert isinstance(row, dict)
            return serialize_v1_record(row)
        return row

    if surface == "legacy":

        @router.patch("/{locator}")
        def update_record(
            locator: str,
            body: update_cls,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_kebab, "update"))
            ],
        ) -> Any:
            definition = class_definition(class_kebab)
            store = record_store(conn, class_kebab, actor_id=user["id"])
            existing = fetch_by_locator(store, definition, locator)
            try:
                return store.update(existing.id, body.model_dump(exclude_unset=True))
            except KeyError as exc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_kebab} not found",
                ) from exc

        @router.delete("/{locator}", status_code=status.HTTP_204_NO_CONTENT)
        def delete_record(
            locator: str,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_kebab, "delete"))
            ],
        ) -> Response:
            definition = class_definition(class_kebab)
            store = record_store(conn, class_kebab, actor_id=user["id"])
            existing = fetch_by_locator(store, definition, locator)
            if not store.delete(existing.id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_kebab} not found",
                )
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
