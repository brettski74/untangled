"""Explicit SQL create / fetch / update / delete for class-definition rows."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Mapping
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row
from pydantic import BaseModel

from untangled.mapping.datetime_utc import format_utc_iso_z, utc_now
from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELD_NAMES
from untangled.mapping.types import format_friendly_id, friendly_id_sequence_name
from untangled.persistence.actor import SYSTEM_USER_ID
from untangled.persistence.fk_enrichment import (
    RelatedIdentity,
    build_enriched_read_plan,
    map_enriched_row,
)
from untangled.persistence.ids import new_uuid7
from untangled.persistence.search import SearchResult, SortDirection, execute_search


class RecordStore[T: BaseModel]:
    """Thin persistence API for one class definition and its Pydantic model."""

    def __init__(
        self,
        conn: Connection,
        definition: ClassDefinition,
        model_cls: type[T],
        *,
        actor_id: UUID = SYSTEM_USER_ID,
        definitions_by_kebab: Mapping[str, ClassDefinition] | None = None,
    ) -> None:
        self._conn = conn
        self._definition = definition
        self._model_cls = model_cls
        self._actor_id = actor_id
        self._definitions_by_kebab = (
            dict(definitions_by_kebab)
            if definitions_by_kebab is not None
            else {definition.name_kebab: definition}
        )
        self._user_columns = tuple(attr.name_snake for attr in definition.attributes)
        self._all_columns = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            *self._user_columns,
        )
        self._friendly = definition.friendly_id_attr()

    def create(self, user_fields: Mapping[str, Any], *, row_id: UUID | None = None) -> T:
        """Insert a row. Stamps UUIDv7 ``id``, audit fields, and friendly-id if any."""
        self._reject_system_keys(user_fields, context="create")
        self._reject_friendly_id_keys(user_fields, context="create")
        now = utc_now()
        payload = {
            **dict(user_fields),
            "id": row_id if row_id is not None else new_uuid7(),
            "created_at": now,
            "updated_at": now,
            "created_by": self._actor_id,
            "updated_by": self._actor_id,
        }
        if self._friendly is not None and self._friendly.prefix is not None:
            payload[self._friendly.name_snake] = self._allocate_friendly_id()
        obj = self._model_cls.model_validate(payload)
        values = [getattr(obj, name) for name in self._all_columns]
        placeholders = sql.SQL(", ").join([sql.Placeholder()] * len(self._all_columns))
        insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
            sql.Identifier(self._definition.name_snake),
            sql.SQL(", ").join(sql.Identifier(c) for c in self._all_columns),
            placeholders,
        )
        with self._conn.cursor() as cur:
            cur.execute(insert, values)
        self._conn.commit()
        return obj

    def fetch_by_id(
        self,
        row_id: UUID,
        *,
        enrich_fk_identity: bool = False,
    ) -> T | dict[str, Any] | None:
        """Fetch one row by primary key, or ``None`` if missing.

        When ``enrich_fk_identity`` is true, returns a dict with scalar fields and
        neutral ``RelatedIdentity`` values for FK columns (not a Pydantic model).
        """
        if enrich_fk_identity:
            return self._fetch_enriched(where_column="id", where_value=row_id)
        query = sql.SQL("SELECT {} FROM {} WHERE id = {}").format(
            sql.SQL(", ").join(sql.Identifier(c) for c in self._all_columns),
            sql.Identifier(self._definition.name_snake),
            sql.Placeholder(),
        )
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (row_id,))
            row = cur.fetchone()
        if row is None:
            return None
        return self._model_cls.model_validate(dict(row))

    def fetch_by_friendly_id(
        self,
        value: str,
        *,
        enrich_fk_identity: bool = False,
    ) -> T | dict[str, Any] | None:
        """Fetch one row by friendly-id column, or ``None`` if missing."""
        if self._friendly is None:
            raise ValueError(
                f"{self._definition.name_snake} has no friendly-id attribute"
            )
        if enrich_fk_identity:
            return self._fetch_enriched(
                where_column=self._friendly.name_snake, where_value=value
            )
        query = sql.SQL("SELECT {} FROM {} WHERE {} = {}").format(
            sql.SQL(", ").join(sql.Identifier(c) for c in self._all_columns),
            sql.Identifier(self._definition.name_snake),
            sql.Identifier(self._friendly.name_snake),
            sql.Placeholder(),
        )
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (value,))
            row = cur.fetchone()
        if row is None:
            return None
        return self._model_cls.model_validate(dict(row))

    def update(self, row_id: UUID, user_fields: Mapping[str, Any]) -> T:
        """Update user fields. Stamps ``updated_at`` / ``updated_by``; leaves ``created_*``."""
        self._reject_system_keys(user_fields, context="update")
        self._reject_friendly_id_keys(user_fields, context="update")
        existing = self.fetch_by_id(row_id)
        if existing is None:
            raise KeyError(f"{self._definition.name_snake} id={row_id} not found")
        assert isinstance(existing, BaseModel)

        now = utc_now()
        merged = existing.model_dump()
        merged.update(dict(user_fields))
        merged["id"] = existing.id
        merged["created_at"] = existing.created_at
        merged["created_by"] = existing.created_by
        merged["updated_at"] = now
        merged["updated_by"] = self._actor_id
        if self._friendly is not None:
            merged[self._friendly.name_snake] = getattr(
                existing, self._friendly.name_snake
            )

        obj = self._model_cls.model_validate(merged)
        set_columns = ("updated_at", "updated_by", *self._user_columns)
        assignments = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder())
            for c in set_columns
        )
        values = [getattr(obj, name) for name in set_columns]
        values.append(row_id)
        update_sql = sql.SQL("UPDATE {} SET {} WHERE id = {}").format(
            sql.Identifier(self._definition.name_snake),
            assignments,
            sql.Placeholder(),
        )
        with self._conn.cursor() as cur:
            cur.execute(update_sql, values)
        self._conn.commit()
        return obj

    def delete(self, row_id: UUID) -> bool:
        """Hard-delete one row by id. Returns True if a row was deleted."""
        delete_sql = sql.SQL("DELETE FROM {} WHERE id = {}").format(
            sql.Identifier(self._definition.name_snake),
            sql.Placeholder(),
        )
        with self._conn.cursor() as cur:
            cur.execute(delete_sql, (row_id,))
            deleted = cur.rowcount > 0
        self._conn.commit()
        return deleted

    def search(
        self,
        *,
        predicate: Mapping[str, Any] | None = None,
        sort: list[tuple[str, SortDirection]] | None = None,
        attributes: list[str] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        enrich_fk_identity: bool = False,
    ) -> SearchResult:
        """Definition-driven predicate search with projection and pagination."""
        pred = dict(predicate) if predicate is not None else None
        return execute_search(
            self._conn,
            self._definition,
            predicate=pred,
            sort=sort,
            attributes=attributes,
            limit=limit,
            offset=offset,
            enrich_fk_identity=enrich_fk_identity,
            definitions_by_kebab=self._definitions_by_kebab,
        )

    def _fetch_enriched(
        self, *, where_column: str, where_value: Any
    ) -> dict[str, Any] | None:
        plan = build_enriched_read_plan(
            self._definition,
            self._definitions_by_kebab,
            list(self._all_columns),
        )
        query = sql.SQL("SELECT {} FROM {} WHERE {}.{} = {}").format(
            plan.select_list,
            plan.from_clause,
            sql.Identifier("src"),
            sql.Identifier(where_column),
            sql.Placeholder(),
        )
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (where_value,))
            row = cur.fetchone()
        if row is None:
            return None
        return _serialize_enriched_row(
            map_enriched_row(dict(row), plan), list(self._all_columns)
        )

    def _allocate_friendly_id(self) -> str:
        assert self._friendly is not None and self._friendly.prefix is not None
        seq_name = friendly_id_sequence_name(self._friendly.prefix)
        with self._conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT nextval({})").format(sql.Literal(seq_name)),
            )
            row = cur.fetchone()
        assert row is not None
        return format_friendly_id(
            self._friendly.prefix,
            int(row[0]),
            self._friendly.pad_width,
        )

    def _reject_system_keys(self, user_fields: Mapping[str, Any], *, context: str) -> None:
        forbidden = set(user_fields) & SYSTEM_FIELD_NAMES
        if forbidden:
            raise ValueError(
                f"{context} payload must not include system fields: {sorted(forbidden)}"
            )

    def _reject_friendly_id_keys(
        self, user_fields: Mapping[str, Any], *, context: str
    ) -> None:
        if self._friendly is None:
            return
        if self._friendly.name_snake in user_fields:
            raise ValueError(
                f"{context} payload must not include server-assigned friendly-id "
                f"field {self._friendly.name_snake!r}"
            )


def _serialize_enriched_row(
    row: dict[str, Any], columns: list[str]
) -> dict[str, Any]:
    """Serialize scalars; leave RelatedIdentity for the protocol layer."""
    out: dict[str, Any] = {}
    for name in columns:
        value = row[name]
        if isinstance(value, RelatedIdentity):
            out[name] = value
        elif isinstance(value, UUID):
            out[name] = str(value)
        elif isinstance(value, datetime):
            out[name] = format_utc_iso_z(value)
        elif isinstance(value, Decimal):
            out[name] = str(value)
        else:
            out[name] = value
    return out
