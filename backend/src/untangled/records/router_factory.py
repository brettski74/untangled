"""Factory for class CRUD routers (Incident, Change Request, …)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from untangled.auth.dependencies import DbConn
from untangled.rbac.dependencies import require_class_operation
from untangled.records.deps import class_definition, fetch_by_locator, model, record_store


def build_class_router(
    *,
    class_kebab: str,
    prefix: str,
    tags: list[str],
) -> APIRouter:
    """Build authenticated CRUD routes for a class with optional friendly-id locator."""
    create_cls: type[BaseModel] = model(class_kebab, "Create")
    update_cls: type[BaseModel] = model(class_kebab, "Update")
    router = APIRouter(prefix=prefix, tags=tags)

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

    @router.get("/{locator}")
    def fetch_record(
        locator: str,
        conn: DbConn,
        user: Annotated[
            dict[str, Any], Depends(require_class_operation(class_kebab, "read"))
        ],
    ) -> Any:
        definition = class_definition(class_kebab)
        store = record_store(conn, class_kebab, actor_id=user["id"])
        return fetch_by_locator(store, definition, locator)

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
