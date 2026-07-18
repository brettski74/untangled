"""Thin PostgreSQL persistence for class definitions (explicit SQL, no ORM)."""

from untangled.persistence.actor import STUB_ACTOR_ID
from untangled.persistence.connection import connect, database_url
from untangled.persistence.ids import new_uuid7
from untangled.persistence.schema import apply_schema, sync_table
from untangled.persistence.store import RecordStore

__all__ = [
    "STUB_ACTOR_ID",
    "RecordStore",
    "apply_schema",
    "connect",
    "database_url",
    "new_uuid7",
    "sync_table",
]
