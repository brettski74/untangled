"""Versioned ``/api/v2`` record router factory (distinct from legacy/v1)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from untangled.auth.dependencies import DbConn
from untangled.coherence import notify_system_config_changed
from untangled.persistence.search import SearchNestingLimits
from untangled.rbac.dependencies import require_class_operation
from untangled.records.deps import class_definition, fetch_by_locator, model, record_store
from untangled.records.read_protocol import (
    V1SearchResponse,
    serialize_v1_record,
    serialize_v1_search_items,
)
from untangled.records.search_models import (
    SearchRequest,
    SearchStructuralError,
    SearchValidationError,
)
from untangled.system_config import SystemConfigUnreadableError, get_system_config


def build_v2_class_router(
    *,
    class_kebab: str,
    prefix: str,
    tags: list[str],
) -> APIRouter:
    """Build ``/api/v2`` CRUD routes for one class.

    Path segment is the live class ``name`` (singular; no pluralization).
    Fetch/search/update/create responses use the same FK identity enrichment
    wire shape as ``/api/v1`` reads. Create and delete are versioned here.
    """
    create_cls: type[BaseModel] = model(class_kebab, "Create")
    update_cls: type[BaseModel] = model(class_kebab, "Update")
    definition = class_definition(class_kebab)
    router = APIRouter(prefix=prefix, tags=tags)
    op_base = class_kebab.replace("-", "_")

    if not definition.suppress_create:

        @router.post(
            "",
            status_code=status.HTTP_201_CREATED,
            summary="Create one record with FK identity enrichment",
            description=(
                "Versioned create. Request body uses scalar foreign-key UUIDs. "
                "The response is the full created record with the same FK "
                "identity enrichment as versioned fetch (including audit "
                "created_by / updated_by). Path tracks live class name."
            ),
            operation_id=f"{op_base}_v2_create",
        )
        def create_record(
            body: create_cls,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_kebab, "create"))
            ],
        ) -> Any:
            store = record_store(conn, class_kebab, actor_id=user["id"])
            created = store.create(body.model_dump())
            row = store.fetch_by_id(created.id, enrich_fk_identity=True)
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_kebab} not found",
                )
            assert isinstance(row, dict)
            return serialize_v1_record(row)

    if not definition.suppress_search:

        @router.post(
            "/search",
            response_model=V1SearchResponse,
            summary="Search records with FK identity enrichment",
            description=(
                "Versioned search. Projected foreign-key fields are identity "
                "objects with canonical id plus configured display_name / "
                "friendly_id. Path tracks live class name; "
                "to v2 yet."
            ),
            operation_id=f"{op_base}_v2_search",
        )
        def search_records(
            body: SearchRequest,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_kebab, "read"))
            ],
        ) -> V1SearchResponse:
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
                config = get_system_config(conn)
                limits = SearchNestingLimits(
                    max_depth=config.max_search_nesting_depth,
                    max_length=config.max_search_nesting_length,
                    max_total_predicates=config.max_search_total_predicates,
                    max_total_regexp=config.max_search_total_regexp,
                )
                result = store.search(
                    limits=limits,
                    predicate=body.predicate,
                    sort=sort_keys,
                    attributes=body.attributes,
                    limit=body.limit,
                    offset=body.offset,
                    enrich_fk_identity=True,
                )
            except SystemConfigUnreadableError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "system configuration could not be read; "
                        "search cannot run"
                    ),
                ) from exc
            except SearchStructuralError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                ) from exc
            except SearchValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=str(exc),
                ) from exc
            return V1SearchResponse(
                items=serialize_v1_search_items(result.items),
                limit=result.limit,
                offset=result.offset,
                total=result.total,
            )

    @router.get(
        "/{locator}",
        summary="Fetch one record with FK identity enrichment",
        description=(
            "Versioned fetch. All foreign-key fields (including audit "
            "created_by / updated_by) are identity objects. Path tracks live "
            "class name."
        ),
        operation_id=f"{op_base}_v2_fetch",
    )
    def fetch_record(
        locator: str,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_kebab, "read"))
        ],
    ) -> Any:
        record_def = class_definition(class_kebab)
        store = record_store(conn, class_kebab, actor_id=user["id"])
        row = fetch_by_locator(
            store, record_def, locator, enrich_fk_identity=True
        )
        assert isinstance(row, dict)
        return serialize_v1_record(row)

    @router.patch(
        "/{locator}",
        summary="Update one record with FK identity enrichment",
        description=(
            "Versioned update. Request body uses scalar foreign-key UUIDs. The "
            "response is the full updated record with the same FK identity "
            "enrichment as versioned fetch (including audit created_by / "
            "updated_by). Path tracks live class name; to "
            "v2 yet."
        ),
        operation_id=f"{op_base}_v2_update",
    )
    def update_record(
        locator: str,
        body: update_cls,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_kebab, "update"))
        ],
    ) -> Any:
        record_def = class_definition(class_kebab)
        store = record_store(conn, class_kebab, actor_id=user["id"])
        existing = fetch_by_locator(store, record_def, locator)
        try:
            updated = store.update(existing.id, body.model_dump(exclude_unset=True))
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{class_kebab} not found",
            ) from exc
        if class_kebab == "system_config":
            notify_system_config_changed()
        row = store.fetch_by_id(updated.id, enrich_fk_identity=True)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{class_kebab} not found",
            )
        assert isinstance(row, dict)
        return serialize_v1_record(row)

    if not definition.suppress_delete:

        @router.delete(
            "/{locator}",
            status_code=status.HTTP_204_NO_CONTENT,
            summary="Delete one record",
            description=(
                "Versioned delete. Path tracks live class name."
            ),
            operation_id=f"{op_base}_v2_delete",
        )
        def delete_record(
            locator: str,
            conn: DbConn,
            user: Annotated[
                dict[str, Any],
                Depends(require_class_operation(class_kebab, "delete")),
            ],
        ) -> Response:
            record_def = class_definition(class_kebab)
            store = record_store(conn, class_kebab, actor_id=user["id"])
            existing = fetch_by_locator(store, record_def, locator)
            if not store.delete(existing.id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_kebab} not found",
                )
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
