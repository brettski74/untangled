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
from untangled.schema.ir import CheckIR, ColumnIR, SchemaIR, TableIR
from untangled.schema.plan import AddCheck, AddColumn, CreateTable, DropColumnDefault
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
    for name in sorted(s.name for s in desired.sequences):
        conn.execute(sql.SQL("DROP SEQUENCE IF EXISTS {}").format(sql.Identifier(name)))
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
    current = introspect_schema(
        db_conn,
        [t.name for t in desired.tables],
        sequence_names=[s.name for s in desired.sequences],
    )
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


def test_migrate_ensures_system_user_before_audit_fks(
    db_conn: Connection,
    repo_definitions: Path,
) -> None:
    """Orphan SYSTEM_USER_ID stamps must not block ADD FOREIGN KEY on upgrade."""
    from datetime import datetime, timezone
    from decimal import Decimal

    from untangled.persistence.actor import SYSTEM_USER_ID
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
            SYSTEM_USER_ID,
            SYSTEM_USER_ID,
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
    assert any("ensure system user" in m for m in messages)
    assert any("ADD FOREIGN KEY" in m for m in messages)

    system_user = db_conn.execute(
        'SELECT id FROM "user" WHERE id = %s',
        (SYSTEM_USER_ID,),
    ).fetchone()
    assert system_user is not None
    assert (
        db_conn.execute(
            "SELECT created_by FROM demo_item WHERE id = %s",
            (item_id,),
        ).fetchone()[0]
        == SYSTEM_USER_ID
    )


def test_migrate_required_create_default_backfills_populated_table(
    db_conn: Connection,
) -> None:
    """Non-system_config table: ADD NOT NULL DEFAULT then DROP DEFAULT, same txn."""
    db_conn.execute("DROP TABLE IF EXISTS migrate_default_scratch CASCADE")
    db_conn.execute(
        "CREATE TABLE migrate_default_scratch ("
        "id uuid PRIMARY KEY, title text NOT NULL)"
    )
    from untangled.persistence.ids import new_uuid7

    row_id = new_uuid7()
    db_conn.execute(
        "INSERT INTO migrate_default_scratch (id, title) VALUES (%s, %s)",
        (row_id, "existing"),
    )
    db_conn.commit()

    current = introspect_schema(db_conn, ["migrate_default_scratch"])
    desired = SchemaIR(
        tables=(
            TableIR(
                name="migrate_default_scratch",
                columns=(
                    ColumnIR("id", "uuid", False),
                    ColumnIR("title", "text", False),
                    ColumnIR("priority", "integer", False),
                ),
                primary_key=("id",),
            ),
        )
    )
    plan = diff_schemas(
        desired,
        current,
        column_add_defaults={("migrate_default_scratch", "priority"): 7},
    )
    assert [type(op) for op in plan.ops] == [AddColumn, DropColumnDefault]

    try:
        for op in plan.ops:
            db_conn.execute(compile_op(op))
        db_conn.commit()
    except Exception:
        db_conn.rollback()
        raise

    value = db_conn.execute(
        "SELECT priority FROM migrate_default_scratch WHERE id = %s",
        (row_id,),
    ).fetchone()[0]
    assert value == 7

    default_row = db_conn.execute(
        """
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'migrate_default_scratch'
          AND column_name = 'priority'
        """
    ).fetchone()
    assert default_row is not None
    assert default_row[0] is None

    db_conn.execute("DROP TABLE IF EXISTS migrate_default_scratch CASCADE")
    db_conn.commit()


def test_migrate_required_add_without_default_fails_when_populated(
    db_conn: Connection,
) -> None:
    db_conn.execute("DROP TABLE IF EXISTS migrate_nodefault_scratch CASCADE")
    db_conn.execute(
        "CREATE TABLE migrate_nodefault_scratch ("
        "id uuid PRIMARY KEY, title text NOT NULL)"
    )
    from untangled.persistence.ids import new_uuid7

    db_conn.execute(
        "INSERT INTO migrate_nodefault_scratch (id, title) VALUES (%s, %s)",
        (new_uuid7(), "existing"),
    )
    db_conn.commit()

    current = introspect_schema(db_conn, ["migrate_nodefault_scratch"])
    desired = SchemaIR(
        tables=(
            TableIR(
                name="migrate_nodefault_scratch",
                columns=(
                    ColumnIR("id", "uuid", False),
                    ColumnIR("title", "text", False),
                    ColumnIR("priority", "integer", False),
                ),
                primary_key=("id",),
            ),
        )
    )
    plan = diff_schemas(desired, current)
    assert len(plan.ops) == 1
    assert isinstance(plan.ops[0], AddColumn)
    assert plan.ops[0].add_default is None

    with pytest.raises(Exception):
        db_conn.execute(compile_op(plan.ops[0]))
        db_conn.commit()
    db_conn.rollback()

    cols = {
        r[0]
        for r in db_conn.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'migrate_nodefault_scratch'
            """
        ).fetchall()
    }
    assert "priority" not in cols

    db_conn.execute("DROP TABLE IF EXISTS migrate_nodefault_scratch CASCADE")
    db_conn.commit()


def test_check_constraint_ddl_introspect_round_trip(db_conn: Connection) -> None:
    db_conn.execute("DROP TABLE IF EXISTS check_rt CASCADE")
    db_conn.execute(
        "CREATE TABLE check_rt (id uuid PRIMARY KEY, quantity integer NOT NULL)"
    )
    expression = "id = '01900000-0000-7000-8000-000000000050'::uuid"
    db_conn.execute(
        compile_op(
            AddCheck(
                table_name="check_rt",
                check=CheckIR(name="check_rt_check_1", expression=expression),
            )
        )
    )
    db_conn.commit()
    current = introspect_schema(db_conn, ["check_rt"])
    assert current.tables[0].checks == (
        CheckIR(name="check_rt_check_1", expression=expression),
    )
    db_conn.execute("DROP TABLE IF EXISTS check_rt CASCADE")
    db_conn.commit()