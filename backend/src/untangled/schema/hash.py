"""SHA-256 fingerprints for whole-schema and per-table Schema IR."""

from __future__ import annotations

import hashlib

from untangled.schema.ir import SchemaIR, TableIR
from untangled.schema.serialize import canonical_bytes, table_canonical_bytes


def schema_hash(schema: SchemaIR) -> str:
    """Return the SHA-256 hex digest of the canonical whole-schema serialization."""
    return hashlib.sha256(canonical_bytes(schema)).hexdigest()


def table_hash(table: TableIR) -> str:
    """Return the SHA-256 hex digest of one table/class IR slice."""
    return hashlib.sha256(table_canonical_bytes(table)).hexdigest()
