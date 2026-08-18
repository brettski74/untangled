"""Diff-based schema migrate: plan, destructive gate, transactional apply."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection

from untangled.mapping.datetime_utc import utc_now
from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.system_fields import AUDIT_USER_TABLE
from untangled.mapping.well_known import clock_env, substitute_if_tokens
from untangled.schema.ddl import compile_op
from untangled.schema.diff import AddDefaultValue, diff_schemas
from untangled.schema.from_yaml import desired_schema_from_classes
from untangled.schema.introspect import introspect_schema, list_base_table_names
from untangled.schema.ir import SchemaIR, TableIR
from untangled.schema.plan import AddForeignKey, MigrationOp, MigrationPlan
from untangled.schema.sequences import resolve_sequence_starts
from untangled.schema.versions import (
    BOOTSTRAP_TABLE_NAMES,
    create_restore_point,
    ensure_bootstrap_tables,
    next_schema_version_id,
    record_schema_version,
    restore_point_name_for,
)
from untangled.seed import upsert_system_user
from untangled.system_config.bootstrap import ensure_system_config_row

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


def _current_schema(
    conn: Connection,
    desired_table_names: list[str],
    sequence_names: list[str],
) -> SchemaIR:
    """Load current IR from every public BASE TABLE except bootstrap bookkeeping.

    YAML-named tables are fully introspected. Other public tables are hitch-hikers
    included by name only so ``diff_schemas`` emits ``DropTable`` (CASCADE)
    without requiring class-vocabulary column types.
    """
    desired_names = set(desired_table_names)
    public_tables = list_base_table_names(conn, exclude=BOOTSTRAP_TABLE_NAMES)
    present_desired = [name for name in public_tables if name in desired_names]
    hitchhikers = [name for name in public_tables if name not in desired_names]
    current = introspect_schema(
        conn, present_desired, sequence_names=sequence_names
    )
    if not hitchhikers:
        return current
    extra = tuple(
        TableIR(name=name, columns=(), primary_key=()) for name in hitchhikers
    )
    return SchemaIR(tables=current.tables + extra, sequences=current.sequences)


def migrate(
    conn: Connection,
    definitions_dir: Path,
    *,
    allow_destructive: bool = False,
    progress: ProgressFn | None = None,
) -> MigrateResult:
    """Reconcile the database to YAML class definitions via diff → plan → SQL.

    Desired IR is YAML-only. Current IR is every ``public`` BASE TABLE except
    bootstrap bookkeeping (``schema_versions``, ``schema_version_class_hashes``).
    Extra public tables are hitch-hikers and become gated ``DropTable`` ops.
    Destructive plans are rejected unless ``allow_destructive`` is true.
    Changing DDL runs in one transaction after a named restore point; failure
    rolls back schema changes.
    """
    log = progress or (lambda _msg: None)
    definitions = load_definitions(definitions_dir)
    desired = desired_schema_from_classes(definitions)
    managed = [t.name for t in desired.tables]
    managed_seqs = [s.name for s in desired.sequences]

    ensure_bootstrap_tables(conn)
    current = _current_schema(conn, managed, managed_seqs)
    # Resolve max+1 starts only for sequences that will be created.
    desired_for_plan = resolve_sequence_starts(conn, desired)
    migrate_clock = clock_env(utc_now())
    plan = diff_schemas(
        desired_for_plan,
        current,
        column_add_defaults=_required_create_defaults(
            definitions, env=migrate_clock
        ),
    )

    if plan.is_empty:
        log("migrate: no changes (no-op)")
        log("migrate: ensure system user (platform attribution principal)")
        upsert_system_user(conn)
        log("migrate: ensure system_config singleton")
        ensure_system_config_row(conn)
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
        system_user_ensured = False
        for op in plan.ops:
            if (
                not system_user_ensured
                and isinstance(op, AddForeignKey)
                and op.foreign_key.referenced_table == AUDIT_USER_TABLE
            ):
                log(
                    "migrate: ensure system user "
                    f"on {AUDIT_USER_TABLE} for audit FKs"
                )
                upsert_system_user(conn)
                system_user_ensured = True
            log(f"migrate: {op.describe()}")
            conn.execute(compile_op(op))
        log("migrate: ensure system user (platform attribution principal)")
        upsert_system_user(conn)
        log("migrate: ensure system_config singleton")
        ensure_system_config_row(conn)
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


def _required_create_defaults(
    definitions: list[ClassDefinition],
    *,
    env: dict[str, str] | None = None,
) -> dict[tuple[str, str], AddDefaultValue]:
    """Map ``(table, column)`` → create-default for required attrs that declare one.

    String defaults may contain ``${now}`` / ``${tomorrow}``; they are
    substituted with ``env`` (one clock for the whole migrate run).
    """
    defaults: dict[tuple[str, str], AddDefaultValue] = {}
    for defn in definitions:
        for attr in defn.attributes:
            if not attr.required or attr.create_default is None:
                continue
            resolved = substitute_if_tokens(
                attr.create_default, "create_default", env=env
            )
            defaults[(defn.name_snake, attr.name_snake)] = resolved
    return defaults


def format_destructive_ops(ops: tuple[MigrationOp, ...]) -> str:
    """Human-readable list of destructive ops (for CLI / tests)."""
    return "\n".join(op.describe() for op in ops)
