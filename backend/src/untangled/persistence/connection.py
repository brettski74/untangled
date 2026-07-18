"""Database connection helpers driven by environment / local defaults."""

from __future__ import annotations

import os

import psycopg

# Matches compose.yaml service credentials. Override with DATABASE_URL in any env.
DEFAULT_DATABASE_URL = "postgresql://untangled:untangled@127.0.0.1:5432/untangled"


def database_url() -> str:
    """Return the Postgres URL from ``DATABASE_URL`` or the documented default."""
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def connect() -> psycopg.Connection:
    """Open a ``psycopg`` connection using ``database_url()``."""
    return psycopg.connect(database_url())
