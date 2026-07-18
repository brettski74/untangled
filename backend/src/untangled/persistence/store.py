"""Explicit SQL create / fetch / update for class-definition rows."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row
from pydantic import BaseModel

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELD_NAMES
from untangled.persistence.actor import STUB_ACTOR_ID
from untangled.persistence.ids import new_uuid7


class RecordStore[T: BaseModel]:
    """Thin persistence API for one class definition and its Pydantic model."""

    def __init__(
        self,
        conn: Connection,
        definition: ClassDefinition,
        model_cls: type[T],
        *,
        actor_id: UUID = STUB_ACTOR_ID,
    ) -> None:
        self._conn = conn
        self._definition = definition
        self._model_cls = model_cls
        self._actor_id = actor_id
        self._user_columns = tuple(attr.name_snake for attr in definition.attributes)
        self._all_columns = (
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            *self._user_columns,
        )

    def create(self, user_fields: Mapping[str, Any]) -> T:
        """Insert a row. Stamps UUIDv7 ``id`` and audit fields; validates via Pydantic."""
        self._reject_system_keys(user_fields, context="create")
        now = datetime.now(timezone.utc)
        row_id = new_uuid7()
        payload = {
            **dict(user_fields),
            "id": row_id,
            "created_at": now,
            "updated_at": now,
            "created_by": self._actor_id,
            "updated_by": self._actor_id,
        }
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

    def fetch_by_id(self, row_id: UUID) -> T | None:
        """Fetch one row by primary key, or ``None`` if missing."""
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

    def update(self, row_id: UUID, user_fields: Mapping[str, Any]) -> T:
        """Update user fields. Stamps ``updated_at`` / ``updated_by``; leaves ``created_*``."""
        self._reject_system_keys(user_fields, context="update")
        existing = self.fetch_by_id(row_id)
        if existing is None:
            raise KeyError(f"{self._definition.name_snake} id={row_id} not found")

        now = datetime.now(timezone.utc)
        merged = existing.model_dump()
        merged.update(dict(user_fields))
        merged["id"] = existing.id
        merged["created_at"] = existing.created_at
        merged["created_by"] = existing.created_by
        merged["updated_at"] = now
        merged["updated_by"] = self._actor_id

        obj = self._model_cls.model_validate(merged)
        set_columns = ("updated_at", "updated_by", *self._user_columns)
        assignments = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder()) for c in set_columns
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

    def _reject_system_keys(self, user_fields: Mapping[str, Any], *, context: str) -> None:
        forbidden = set(user_fields) & SYSTEM_FIELD_NAMES
        if forbidden:
            raise ValueError(
                f"{context} payload must not include system fields: {sorted(forbidden)}"
            )
