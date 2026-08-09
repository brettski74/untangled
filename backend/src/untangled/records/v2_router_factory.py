"""Versioned ``/api/v2`` record router factory."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from untangled.audit.context import client_ip
from untangled.audit.emit import emit_best_effort, emit_fail_closed, make_event
from untangled.audit.file_sink import AuditWriteError
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity
from untangled.audit.volume import note_search
from untangled.auth.dependencies import DbConn
from untangled.coherence import notify_system_config_changed
from untangled.persistence.search import SearchNestingLimits
from untangled.rbac.dependencies import require_class_operation
from untangled.records.deps import class_definition, fetch_by_locator, model, record_store
from untangled.records.read_protocol import (
    EnrichedSearchResponse,
    serialize_enriched_record,
    serialize_enriched_search_items,
)
from untangled.records.search_models import (
    SearchRequest,
    SearchStructuralError,
    SearchValidationError,
)
from untangled.system_config import SystemConfigUnreadableError, get_system_config


def _audit_http_500(exc: AuditWriteError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Audit logging failed",
    )


def build_v2_class_router(
    *,
    class_name: str,
    prefix: str,
    tags: list[str],
) -> APIRouter:
    """Build ``/api/v2`` CRUD routes for one class.

    Path segment is the live class ``name`` (singular; no pluralization),
    used unaltered. Fetch/search/update/create responses use FK identity
    enrichment. Create and delete are versioned here.
    """
    create_cls: type[BaseModel] = model(class_name, "Create")
    update_cls: type[BaseModel] = model(class_name, "Update")
    definition = class_definition(class_name)
    router = APIRouter(prefix=prefix, tags=tags)

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
            operation_id=f"{class_name}_v2_create",
        )
        def create_record(
            request: Request,
            body: create_cls,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_name, "create"))
            ],
        ) -> Any:
            store = record_store(conn, class_name, actor_id=user["id"])
            created = store.create(body.model_dump())
            row_id: UUID = created.id
            try:
                emit_fail_closed(
                    make_event(
                        event_type=EventType.RECORD_CREATE,
                        actor_channel=ActorChannel.HUMAN,
                        outcome=Outcome.SUCCESS,
                        reason="create_ok",
                        severity=Severity.INFO,
                        user_id=user["id"],
                        ip_address=client_ip(request),
                        data={"class": class_name, "locator": str(row_id)},
                    )
                )
            except AuditWriteError as exc:
                try:
                    emit_fail_closed(
                        make_event(
                            event_type=EventType.RECORD_DELETE,
                            actor_channel=ActorChannel.SYSTEM,
                            outcome=Outcome.SUCCESS,
                            reason="compensate_audit_failure",
                            severity=Severity.ERROR,
                            user_id=user["id"],
                            ip_address=client_ip(request),
                            data={
                                "class": class_name,
                                "locator": str(row_id),
                                "compensate": True,
                            },
                        )
                    )
                    store.delete(row_id)
                except Exception:
                    pass
                raise _audit_http_500(exc) from exc
            row = store.fetch_by_id(row_id, enrich_fk_identity=True)
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_name} not found",
                )
            assert isinstance(row, dict)
            return serialize_enriched_record(row)

    if not definition.suppress_search:

        @router.post(
            "/search",
            response_model=EnrichedSearchResponse,
            summary="Search records with FK identity enrichment",
            description=(
                "Versioned search. Projected foreign-key fields are identity "
                "objects with canonical id plus configured display_name / "
                "friendly_id. Path tracks live class name."
            ),
            operation_id=f"{class_name}_v2_search",
        )
        def search_records(
            request: Request,
            body: SearchRequest,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_name, "read"))
            ],
        ) -> EnrichedSearchResponse:
            store = record_store(conn, class_name, actor_id=user["id"])
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
            response = EnrichedSearchResponse(
                items=serialize_enriched_search_items(result.items),
                limit=result.limit,
                offset=result.offset,
                total=result.total,
            )
            emit_best_effort(
                make_event(
                    event_type=EventType.RECORD_SEARCH,
                    actor_channel=ActorChannel.HUMAN,
                    outcome=Outcome.SUCCESS,
                    reason="search_ok",
                    severity=Severity.INFO,
                    user_id=user["id"],
                    ip_address=client_ip(request),
                    data={
                        "class": class_name,
                        "limit": result.limit,
                        "offset": result.offset,
                        "total": result.total,
                    },
                )
            )
            try:
                window = int(getattr(config, "audit_bulk_read_window_seconds"))
                max_searches = int(getattr(config, "audit_bulk_read_max_searches"))
            except Exception:
                window, max_searches = 600, 100
            note_search(
                user_id=user["id"],
                window_seconds=window,
                max_searches=max_searches,
                ip_address=client_ip(request),
                class_name=class_name,
            )
            return response

    @router.get(
        "/{locator}",
        summary="Fetch one record with FK identity enrichment",
        description=(
            "Versioned fetch. All foreign-key fields (including audit "
            "created_by / updated_by) are identity objects. Path tracks live "
            "class name."
        ),
        operation_id=f"{class_name}_v2_fetch",
    )
    def fetch_record(
        request: Request,
        locator: str,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_name, "read"))
        ],
    ) -> Any:
        record_def = class_definition(class_name)
        store = record_store(conn, class_name, actor_id=user["id"])
        row = fetch_by_locator(
            store, record_def, locator, enrich_fk_identity=True
        )
        emit_best_effort(
            make_event(
                event_type=EventType.RECORD_FETCH,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="fetch_ok",
                severity=Severity.INFO,
                user_id=user["id"],
                ip_address=client_ip(request),
                data={"class": class_name, "locator": locator},
            )
        )
        assert isinstance(row, dict)
        return serialize_enriched_record(row)

    @router.patch(
        "/{locator}",
        summary="Update one record with FK identity enrichment",
        description=(
            "Versioned update. Request body uses scalar foreign-key UUIDs. The "
            "response is the full updated record with the same FK identity "
            "enrichment as versioned fetch (including audit created_by / "
            "updated_by). Path tracks live class name."
        ),
        operation_id=f"{class_name}_v2_update",
    )
    def update_record(
        request: Request,
        locator: str,
        body: update_cls,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_name, "update"))
        ],
    ) -> Any:
        record_def = class_definition(class_name)
        store = record_store(conn, class_name, actor_id=user["id"])
        existing = fetch_by_locator(store, record_def, locator)
        before = existing.model_dump()
        patch = body.model_dump(exclude_unset=True)
        try:
            updated = store.update(existing.id, patch)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{class_name} not found",
            ) from exc
        if class_name == "system_config":
            notify_system_config_changed()
        try:
            emit_fail_closed(
                make_event(
                    event_type=EventType.RECORD_UPDATE,
                    actor_channel=ActorChannel.HUMAN,
                    outcome=Outcome.SUCCESS,
                    reason="update_ok",
                    severity=Severity.INFO,
                    user_id=user["id"],
                    ip_address=client_ip(request),
                    data={
                        "class": class_name,
                        "locator": str(existing.id),
                        "fields": sorted(patch.keys()),
                    },
                )
            )
        except AuditWriteError as exc:
            try:
                restore = {
                    k: before[k]
                    for k in patch
                    if k in before and k not in ("id", "created_at", "created_by")
                }
                store.update(existing.id, restore)
                emit_fail_closed(
                    make_event(
                        event_type=EventType.AUDIT_COMPENSATE,
                        actor_channel=ActorChannel.SYSTEM,
                        outcome=Outcome.SUCCESS,
                        reason="compensate_restore_after_audit_failure",
                        severity=Severity.ERROR,
                        user_id=user["id"],
                        ip_address=client_ip(request),
                        data={"class": class_name, "locator": str(existing.id)},
                    )
                )
            except Exception:
                pass
            raise _audit_http_500(exc) from exc
        row = store.fetch_by_id(updated.id, enrich_fk_identity=True)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{class_name} not found",
            )
        assert isinstance(row, dict)
        return serialize_enriched_record(row)

    if not definition.suppress_delete:

        @router.delete(
            "/{locator}",
            status_code=status.HTTP_204_NO_CONTENT,
            summary="Delete one record",
            description=("Versioned delete. Path tracks live class name."),
            operation_id=f"{class_name}_v2_delete",
        )
        def delete_record(
            request: Request,
            locator: str,
            conn: DbConn,
            user: Annotated[
                dict[str, Any],
                Depends(require_class_operation(class_name, "delete")),
            ],
        ) -> Response:
            record_def = class_definition(class_name)
            store = record_store(conn, class_name, actor_id=user["id"])
            existing = fetch_by_locator(store, record_def, locator)
            try:
                emit_fail_closed(
                    make_event(
                        event_type=EventType.RECORD_DELETE,
                        actor_channel=ActorChannel.HUMAN,
                        outcome=Outcome.SUCCESS,
                        reason="delete_ok",
                        severity=Severity.NOTICE,
                        user_id=user["id"],
                        ip_address=client_ip(request),
                        data={
                            "class": class_name,
                            "locator": str(existing.id),
                        },
                    )
                )
            except AuditWriteError as exc:
                raise _audit_http_500(exc) from exc
            if not store.delete(existing.id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"{class_name} not found",
                )
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
