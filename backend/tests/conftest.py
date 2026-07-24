"""Shared pytest fixtures for mapping and persistence tests."""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from psycopg import Connection, sql

from untangled.mapping.definition import ClassDefinition, load_definition
from untangled.mapping.generate import generate_models
from untangled.persistence.connection import connect
from untangled.schema.migrate import migrate
from untangled.seed import ensure_stub_actor_user


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session", autouse=True)
def _session_generate_models(repo_root: Path) -> None:
    """Refresh package ``untangled.generated`` for API routers under test."""
    from untangled.mapping.cli import default_paths

    definitions, pydantic_out, zod_out = default_paths(repo_root)
    generate_models(definitions, pydantic_out, zod_out)


@pytest.fixture
def repo_definitions(repo_root: Path) -> Path:
    return repo_root / "backend" / "class-definitions"


def _load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def db_conn() -> Iterator[Connection]:
    """Live Postgres connection; skips if the database is unreachable."""
    try:
        conn = connect()
        conn.execute("SELECT 1")
    except Exception as exc:
        pytest.skip(f"PostgreSQL not available ({exc})")
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def demo_definition(repo_definitions: Path) -> ClassDefinition:
    return load_definition(repo_definitions / "demo-item.yaml")


@pytest.fixture
def demo_model_cls(repo_definitions: Path, tmp_path: Path):
    pydantic_out = tmp_path / "pydantic"
    zod_out = tmp_path / "zod"
    generate_models(repo_definitions, pydantic_out, zod_out)
    module = _load_module(pydantic_out / "demo_item.py", "persistence_demo_item")
    return module.DemoItem


@pytest.fixture
def demo_schema(db_conn: Connection, repo_definitions: Path) -> list[ClassDefinition]:
    # Clear managed data so new audit FKs / unique indexes can apply on shared DBs.
    for table in (
        "user_role",
        "role_permission",
        "demo_link",
        "demo_item",
        "change_request",
        "incident",
        "refresh_token",
        "role",
        "permission",
        "user",
    ):
        db_conn.execute(
            sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(table))
        )
    for seq in ("friendly_id_inc", "friendly_id_chg"):
        db_conn.execute(
            sql.SQL("DROP SEQUENCE IF EXISTS {}").format(sql.Identifier(seq))
        )
    db_conn.commit()
    # allow_destructive so shared test DB can reconcile leftovers to YAML intent.
    result = migrate(db_conn, repo_definitions, allow_destructive=True)
    ensure_stub_actor_user(db_conn)
    return list(result.definitions)
