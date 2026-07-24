"""Persistence tests for friendly-id allocation and delete."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from psycopg import Connection

from untangled.mapping.definition import ClassDefinition, load_definition
from untangled.persistence.actor import STUB_ACTOR_ID
from untangled.persistence.connection import connect
from untangled.persistence.store import RecordStore
from untangled.records.deps import model


@pytest.fixture
def incident_definition(repo_definitions) -> ClassDefinition:
    return load_definition(repo_definitions / "incident.yaml")


@pytest.fixture
def incident_store(
    db_conn: Connection,
    demo_schema,
    incident_definition: ClassDefinition,
) -> RecordStore:
    assert demo_schema
    return RecordStore(
        db_conn,
        incident_definition,
        model("incident"),
        actor_id=STUB_ACTOR_ID,
    )


def test_create_assigns_friendly_id_and_rejects_client_number(
    incident_store: RecordStore,
) -> None:
    created = incident_store.create(
        {"summary": "Disk full", "status": "new", "severity": "High"}
    )
    assert created.number.startswith("INC")
    assert len(created.number) >= 3 + 8

    with pytest.raises(ValueError, match="friendly-id"):
        incident_store.create(
            {
                "summary": "x",
                "status": "new",
                "severity": "Low",
                "number": "INC00009999",
            }
        )

    fetched = incident_store.fetch_by_friendly_id(created.number)
    assert fetched is not None
    assert fetched.id == created.id

    updated = incident_store.update(created.id, {"status": "resolved"})
    assert updated.number == created.number

    with pytest.raises(ValueError, match="friendly-id"):
        incident_store.update(created.id, {"number": "INC00008888"})

    assert incident_store.delete(created.id) is True
    assert incident_store.fetch_by_id(created.id) is None


def test_concurrent_friendly_ids_unique(demo_schema, incident_definition: ClassDefinition) -> None:
    assert demo_schema

    def _create_one(_: int) -> str:
        conn = connect()
        try:
            store = RecordStore(
                conn,
                incident_definition,
                model("incident"),
                actor_id=STUB_ACTOR_ID,
            )
            row = store.create(
                {
                    "summary": "Concurrent",
                    "status": "new",
                    "severity": "Low",
                    "description": None,
                }
            )
            return row.number
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=8) as pool:
        numbers = list(pool.map(_create_one, range(20)))
    assert len(numbers) == len(set(numbers))


def test_migrate_creates_sequence_and_unique_index(
    db_conn: Connection, demo_schema
) -> None:
    assert demo_schema
    seq = db_conn.execute(
        """
        SELECT 1 FROM pg_catalog.pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'friendly_id_inc'
        """
    ).fetchone()
    assert seq is not None
    idx = db_conn.execute(
        """
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'incident'
          AND indexname = 'incident_number_key'
        """
    ).fetchone()
    assert idx is not None
