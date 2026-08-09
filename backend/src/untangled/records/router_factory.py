"""Factory for class CRUD routers (Incident, Change Request, …)."""

from typing import Annotated, Any, Literal
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
from untangled.mapping.naming import kebab_to_snake
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
    SearchResponse,
    SearchStructuralError,
    SearchValidationError,
)
from untangled.system_config import SystemConfigUnreadableError, get_system_config

ApiSurface = Literal["legacy", "v1"]


def _live_class_name(mount_identity: str) -> str:
    """One-way normalize a legacy/v1 mount identity to the live class ``name``.

    Temporary #188 bridge (remove in #192): mounts may still pass historical
    kebab strings; permission keys and definition lookup use the live name only.
    """
    return kebab_to_snake(mount_identity)


def _audit_http_500(exc: AuditWriteError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Audit logging failed",
    )


def build_class_router(
    *,
    class_kebab: str,
    prefix: str,
    tags: list[str],
    surface: ApiSurface = "legacy",
) -> APIRouter:
    """Build authenticated routes for a class.

    ``legacy``: full CRUD + scalar fetch/search (pre-versioning compatibility).
    ``v1``: fetch, search, and update with FK identity enrichment on responses.

    ``class_kebab`` is the mount identity string (may still be kebab for
    transitional call sites). Resolution uses the live class ``name``.
    """
    class_name = _live_class_name(class_kebab)
    create_cls: type[BaseModel] = model(class_name, "Create")
    update_cls: type[BaseModel] = model(class_name, "Update")
    definition = class_definition(class_name)
    router = APIRouter(prefix=prefix, tags=tags)
    enrich = surface == "v1"
    deprecated = surface == "legacy"

    if surface == "legacy" and not definition.suppress_create:

        @router.post("", status_code=status.HTTP_201_CREATED)
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
            return created

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
            "Create/delete remain on unversioned routes until deliberately "
            "versioned."
        )
    )

    if not definition.suppress_search:

        @router.post(
            "/search",
            response_model=search_response_model,
            summary=search_summary,
            description=search_description,
            deprecated=search_deprecated,
            operation_id=f"{class_name}_{surface}_search",
        )
        def search_records(
            request: Request,
            body: SearchRequest,
            conn: DbConn,
            user: Annotated[
                dict[str, Any], Depends(require_class_operation(class_name, "read"))
            ],
        ) -> SearchResponse | V1SearchResponse:
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
                    enrich_fk_identity=enrich,
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
            items = (
                serialize_v1_search_items(result.items) if enrich else result.items
            )
            response_cls = V1SearchResponse if enrich else SearchResponse
            response = response_cls(
                items=items,
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
                        "class": class_kebab,
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
                class_kebab=class_kebab,
            )
            return response

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
            "updated_by) are identity objects. Create/delete remain on unversioned "
            "routes until deliberately versioned."
        )
    )

    @router.get(
        "/{locator}",
        summary=fetch_summary,
        description=fetch_description,
        deprecated=deprecated,
        operation_id=f"{class_name}_{surface}_fetch",
    )
    def fetch_record(
        request: Request,
        locator: str,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_name, "read"))
        ],
    ) -> Any:
        definition = class_definition(class_name)
        store = record_store(conn, class_name, actor_id=user["id"])
        row = fetch_by_locator(
            store, definition, locator, enrich_fk_identity=enrich
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
                data={"class": class_kebab, "locator": locator},
            )
        )
        if enrich:
            assert isinstance(row, dict)
            return serialize_v1_record(row)
        return row

    update_summary = (
        "Update one record (legacy scalar FK responses)"
        if surface == "legacy"
        else "Update one record with FK identity enrichment"
    )
    update_description = (
        "Pre-versioning compatibility route. Foreign-key fields in the response "
        "are scalar UUID strings. Prefer PATCH /api/v1{prefix}/{locator} for new "
        "consumers. Removal is tracked by GitHub issue #117."
        if surface == "legacy"
        else (
            "Versioned update. Request body uses scalar foreign-key UUIDs. The "
            "response is the full updated record with the same FK identity "
            "enrichment as versioned fetch (including audit created_by / "
            "updated_by). Create/delete remain on unversioned routes."
        )
    )

    @router.patch(
        "/{locator}",
        summary=update_summary,
        description=update_description,
        deprecated=deprecated,
        operation_id=f"{class_name}_{surface}_update",
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
        definition = class_definition(class_name)
        store = record_store(conn, class_name, actor_id=user["id"])
        existing = fetch_by_locator(store, definition, locator)
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
                        "class": class_kebab,
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
                        data={"class": class_kebab, "locator": str(existing.id)},
                    )
                )
            except Exception:
                pass
            raise _audit_http_500(exc) from exc
        if not enrich:
            return updated
        row = store.fetch_by_id(updated.id, enrich_fk_identity=True)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{class_name} not found",
            )
        assert isinstance(row, dict)
        return serialize_v1_record(row)

    if surface == "legacy":

        if not definition.suppress_delete:

            @router.delete("/{locator}", status_code=status.HTTP_204_NO_CONTENT)
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
                                "class": class_kebab,
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
