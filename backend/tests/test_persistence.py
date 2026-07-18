"""DB-backed tests for schema sync and demo-item persistence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import ValidationError

from untangled.mapping.definition import ClassDefinition
from untangled.persistence.actor import STUB_ACTOR_ID
from untangled.persistence.ids import new_uuid7
from untangled.persistence.sql_types import YAML_TO_POSTGRES
from untangled.persistence.store import RecordStore


def _user_fields(**overrides: object) -> dict:
    base = {
        "title": "Widget",
        "summary": "A sample row",
        "is_active": True,
        "quantity": 3,
        "unit_price": 1.5,
        "fixed_amount": Decimal("19.99"),
        "due_at": datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc),
    }
    base.update(overrides)
    return base


def test_new_uuid7_is_version_7() -> None:
    value = new_uuid7()
    assert isinstance(value, UUID)
    assert value.version == 7


def test_yaml_types_map_to_postgres() -> None:
    assert YAML_TO_POSTGRES["datetime"] == "timestamptz"
    assert YAML_TO_POSTGRES["decimal"] == "numeric"
    assert YAML_TO_POSTGRES["uuid"] == "uuid"


def test_apply_schema_creates_demo_table(db_conn, demo_schema, demo_definition) -> None:
    assert any(d.name_snake == "demo_item" for d in demo_schema)
    row = db_conn.execute(
        """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (demo_definition.name_snake,),
    ).fetchall()
    names = [r[0] for r in row]
    assert names[:5] == ["id", "created_at", "updated_at", "created_by", "updated_by"]
    assert "title" in names
    assert "fixed_amount" in names


def test_create_fetch_update_round_trip(
    db_conn,
    demo_schema,
    demo_definition: ClassDefinition,
    demo_model_cls,
) -> None:
    assert demo_schema  # schema applied
    store = RecordStore(db_conn, demo_definition, demo_model_cls)

    created = store.create(_user_fields())
    assert created.id.version == 7
    assert created.created_by == STUB_ACTOR_ID
    assert created.updated_by == STUB_ACTOR_ID
    assert created.created_at.tzinfo is not None
    assert created.created_at.utcoffset() == timedelta(0)
    assert created.updated_at == created.created_at
    assert created.title == "Widget"
    assert created.fixed_amount == Decimal("19.99")

    fetched = store.fetch_by_id(created.id)
    assert fetched is not None
    assert fetched.model_dump() == created.model_dump()

    before_update = fetched.updated_at
    created_at = fetched.created_at
    created_by = fetched.created_by

    updated = store.update(
        created.id,
        {"title": "Gadget", "quantity": 9, "summary": None},
    )
    assert updated.id == created.id
    assert updated.title == "Gadget"
    assert updated.quantity == 9
    assert updated.summary is None
    assert updated.created_at == created_at
    assert updated.created_by == created_by
    assert updated.updated_by == STUB_ACTOR_ID
    assert updated.updated_at >= before_update
    assert updated.updated_at.utcoffset() == timedelta(0)

    refetched = store.fetch_by_id(created.id)
    assert refetched is not None
    assert refetched.model_dump() == updated.model_dump()


def test_create_rejects_invalid_payload(
    db_conn,
    demo_schema,
    demo_definition: ClassDefinition,
    demo_model_cls,
) -> None:
    assert demo_schema
    store = RecordStore(db_conn, demo_definition, demo_model_cls)
    with pytest.raises(ValidationError):
        store.create(_user_fields(quantity="not-an-int"))


def test_create_rejects_system_fields_in_payload(
    db_conn,
    demo_schema,
    demo_definition: ClassDefinition,
    demo_model_cls,
) -> None:
    assert demo_schema
    store = RecordStore(db_conn, demo_definition, demo_model_cls)
    with pytest.raises(ValueError, match="system fields"):
        store.create(_user_fields(id=new_uuid7()))


def test_update_missing_row_raises(
    db_conn,
    demo_schema,
    demo_definition: ClassDefinition,
    demo_model_cls,
) -> None:
    assert demo_schema
    store = RecordStore(db_conn, demo_definition, demo_model_cls)
    with pytest.raises(KeyError):
        store.update(new_uuid7(), {"title": "Nope"})
