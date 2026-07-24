"""Diff-based schema migrate: plan, destructive gate, transactional apply."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.system_fields import AUDIT_USER_TABLE
from untangled.schema.ddl import compile_op
from untangled.schema.diff import diff_schemas
from untangled.schema.from_yaml import desired_schema_from_classes
from untangled.schema.introspect import introspect_schema
from untangled.schema.ir import SchemaIR
from untangled.schema.plan import AddForeignKey, MigrationOp, MigrationPlan
from untangled.schema.sequences import resolve_sequence_starts
from untangled.schema.versions import (
    create_restore_point,
    ensure_bootstrap_tables,
    next_schema_version_id,
    record_schema_version,
    restore_point_name_for,
)
from untangled.seed import upsert_stub_actor

ProgressFn = Callable[[str], None]


class DestructivePlanError(RuntimeError):
    """Raised when a migrate plan includes destructive ops and allow is false."""

    def __init__(self, plan: MigrationPlan) -> None:
        self.plan = plan
        destructive = plan.destructive_ops
        lines = [
            "migrate refused: plan includes destructive operations "
            "(re-run with allow_destructive=True to apply):",
            *[f"  - {op.describe()}" for op in destructive],
        ]
        super().__init__("\n".join(lines))


@dataclass(frozen=True, slots=True)
class MigrateResult:
    """Outcome of a ``migrate()`` call."""

    definitions: tuple[ClassDefinition, ...]
    desired: SchemaIR
    plan: MigrationPlan
    applied: bool
    version_id: int | None
    restore_point_name: str | None


def migrate(
    conn: Connection,
    definitions_dir: Path,
    *,
    allow_destructive: bool = False,
    progress: ProgressFn | None = None,
) -> MigrateResult:
    """Reconcile the database to YAML class definitions via diff → plan → SQL.

    Bootstrap version tables are created if missing. Destructive plans are
    rejected unless ``allow_destructive`` is true. Changing DDL runs in one
    transaction after a named restore point; failure rolls back schema changes.
    """
    log = progress or (lambda _msg: None)
    definitions = load_definitions(definitions_dir)
    desired = desired_schema_from_classes(definitions)
    managed = [t.name for t in desired.tables]
    managed_seqs = [s.name for s in desired.sequences]

    ensure_bootstrap_tables(conn)
    current = introspect_schema(conn, managed, sequence_names=managed_seqs)
    # Resolve max+1 starts only for sequences that will be created.
    desired_for_plan = resolve_sequence_starts(conn, desired)
    plan = diff_schemas(desired_for_plan, current)

    if plan.is_empty:
        log("migrate: no changes (no-op)")
        conn.commit()
        return MigrateResult(
            definitions=tuple(definitions),
            desired=desired,
            plan=plan,
            applied=False,
            version_id=None,
            restore_point_name=None,
        )

    destructive = plan.destructive_ops
    if destructive and not allow_destructive:
        conn.rollback()
        raise DestructivePlanError(plan)

    version_id = next_schema_version_id(conn)
    rp_name = restore_point_name_for(version_id)
    log(f"migrate: creating restore point {rp_name}")
    create_restore_point(conn, rp_name)

    try:
        stub_actor_ensured = False
        for op in plan.ops:
            if (
                not stub_actor_ensured
                and isinstance(op, AddForeignKey)
                and op.foreign_key.referenced_table == AUDIT_USER_TABLE
            ):
                log(f"migrate: ensure stub actor on {AUDIT_USER_TABLE} for audit FKs")
                upsert_stub_actor(conn)
                stub_actor_ensured = True
            log(f"migrate: {op.describe()}")
            conn.execute(compile_op(op))
        record_schema_version(
            conn,
            version_id=version_id,
            desired=desired,
            restore_point_name=rp_name,
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    log(f"migrate: recorded schema version {version_id}")
    return MigrateResult(
        definitions=tuple(definitions),
        desired=desired,
        plan=plan,
        applied=True,
        version_id=version_id,
        restore_point_name=rp_name,
    )


def format_destructive_ops(ops: tuple[MigrationOp, ...]) -> str:
    """Human-readable list of destructive ops (for CLI / tests)."""
    return "\n".join(op.describe() for op in ops)
