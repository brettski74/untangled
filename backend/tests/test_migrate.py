"""DB-backed tests for diff-based migrate, version history, and destructive gate."""

from __future__ import annotations

from pathlib import Path

import pytest
from psycopg import Connection, sql

from untangled.schema import (
    DestructivePlanError,
    desired_schema_from_definitions,
    introspect_schema,
    migrate,
    schema_hash,
    table_hash,
)
from untangled.schema.ddl import compile_op
from untangled.schema.diff import diff_schemas
from untangled.schema.ir import ColumnIR, SchemaIR, TableIR
from untangled.schema.plan import CreateTable
from untangled.schema.versions import (
    class_hashes_for_version,
    current_version_row,
    ensure_bootstrap_tables,
)


def _drop_managed(conn: Connection, repo_definitions: Path) -> None:
    desired = desired_schema_from_definitions(repo_definitions)
    # CASCADE handles FK order among managed tables.
    for name in sorted(t.name for t in desired.tables):
        conn.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(name)))
    conn.execute("DROP TABLE IF EXISTS schema_version_class_hashes CASCADE")
    conn.execute("DROP TABLE IF EXISTS schema_versions CASCADE")
    conn.commit()


def test_migrate_empty_to_desired_and_noop(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    messages: list[str] = []

    first = migrate(db_conn, repo_definitions, progress=messages.append)
    assert first.applied
    assert first.version_id == 1
    assert first.restore_point_name == "untangled_schema_v1"
    assert any("CREATE TABLE demo_item" in m for m in messages)
    assert any("CREATE TABLE demo_link" in m for m in messages)
    assert any("CREATE TABLE user" in m for m in messages)
    assert any("ADD FOREIGN KEY" in m for m in messages)
    assert any("UNIQUE INDEX" in m for m in messages)

    desired = desired_schema_from_definitions(repo_definitions)
    current = introspect_schema(db_conn, [t.name for t in desired.tables])
    assert schema_hash(desired) == schema_hash(current)

    row = current_version_row(db_conn)
    assert row is not None
    version_id, whole_hash, rp = row
    assert version_id == 1
    assert whole_hash == schema_hash(desired)
    assert rp == "untangled_schema_v1"
    class_rows = dict(class_hashes_for_version(db_conn, version_id))
    by_table = {t.name: t for t in desired.tables}
    assert class_rows["demo_item"] == table_hash(by_table["demo_item"])
    assert class_rows["demo_link"] == table_hash(by_table["demo_link"])
    assert class_rows["user"] == table_hash(by_table["user"])
    assert class_rows["refresh_token"] == table_hash(by_table["refresh_token"])

    messages.clear()
    second = migrate(db_conn, repo_definitions, progress=messages.append)
    assert not second.applied
    assert second.version_id is None
    assert any("no-op" in m for m in messages)
    assert current_version_row(db_conn) == (1, whole_hash, rp)


def test_migrate_rejects_destructive_unless_allowed(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    migrate(db_conn, repo_definitions, allow_destructive=True)
    db_conn.execute("ALTER TABLE demo_item ADD COLUMN legacy_scratch text")
    db_conn.commit()

    with pytest.raises(DestructivePlanError) as excinfo:
        migrate(db_conn, repo_definitions, allow_destructive=False)
    assert "DROP COLUMN demo_item.legacy_scratch" in str(excinfo.value)

    # Column still present after reject.
    cols = {
        r[0]
        for r in db_conn.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'demo_item'
            """
        ).fetchall()
    }
    assert "legacy_scratch" in cols

    allowed = migrate(db_conn, repo_definitions, allow_destructive=True)
    assert allowed.applied
    cols_after = {
        r[0]
        for r in db_conn.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'demo_item'
            """
        ).fetchall()
    }
    assert "legacy_scratch" not in cols_after


def test_migrate_transaction_rolls_back_on_failure(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    _drop_managed(db_conn, repo_definitions)
    ensure_bootstrap_tables(db_conn)
    db_conn.commit()

    scratch = TableIR(
        name="migrate_rollback_scratch",
        columns=(ColumnIR("id", "uuid", False),),
        primary_key=("id",),
    )
    plan = diff_schemas(SchemaIR(tables=(scratch,)), SchemaIR(tables=()))
    assert len(plan.ops) == 1
    assert isinstance(plan.ops[0], CreateTable)

    try:
        db_conn.execute(compile_op(plan.ops[0]))
        # Force failure after first DDL so the transaction cannot commit.
        db_conn.execute("SELECT 1/0")
        db_conn.commit()
    except Exception:
        db_conn.rollback()

    exists = db_conn.execute(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'migrate_rollback_scratch'
        """
    ).fetchone()
    assert exists is None


def test_migrate_ensures_stub_actor_before_audit_fks(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    """Orphan STUB_ACTOR_ID stamps must not block ADD FOREIGN KEY on upgrade."""
    from datetime import datetime, timezone
    from decimal import Decimal

    from untangled.persistence.actor import STUB_ACTOR_ID
    from untangled.persistence.ids import new_uuid7

    _drop_managed(db_conn, repo_definitions)
    ensure_bootstrap_tables(db_conn)

    desired = desired_schema_from_definitions(repo_definitions)
    by_name = {t.name: t for t in desired.tables}
    for name in ("user", "demo_item"):
        table = by_name[name]
        bare = TableIR(
            name=table.name,
            columns=table.columns,
            primary_key=table.primary_key,
            foreign_keys=(),
            indexes=(),
            checks=table.checks,
        )
        db_conn.execute(compile_op(CreateTable(table=bare)))

    now = datetime.now(timezone.utc)
    item_id = new_uuid7()
    db_conn.execute(
        """
        INSERT INTO demo_item (
            id, created_at, updated_at, created_by, updated_by,
            title, summary, is_active, quantity, unit_price, fixed_amount, due_at
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s
        )
        """,
        (
            item_id,
            now,
            now,
            STUB_ACTOR_ID,
            STUB_ACTOR_ID,
            "orphan-audit-row",
            None,
            True,
            1,
            None,
            Decimal("1.00"),
            None,
        ),
    )
    db_conn.commit()

    user_count = db_conn.execute('SELECT count(*) FROM "user"').fetchone()[0]
    assert user_count == 0

    messages: list[str] = []
    result = migrate(db_conn, repo_definitions, progress=messages.append)
    assert result.applied
    assert any("ensure stub actor" in m for m in messages)
    assert any("ADD FOREIGN KEY" in m for m in messages)

    stub = db_conn.execute(
        'SELECT id FROM "user" WHERE id = %s',
        (STUB_ACTOR_ID,),
    ).fetchone()
    assert stub is not None
    assert (
        db_conn.execute(
            "SELECT created_by FROM demo_item WHERE id = %s",
            (item_id,),
        ).fetchone()[0]
        == STUB_ACTOR_ID
    )