"""Diff desired Schema IR against current IR into an ordered migration plan."""

from __future__ import annotations

from collections import deque

from untangled.schema.ir import SchemaIR, TableIR
from untangled.schema.plan import (
    AddColumn,
    AddForeignKey,
    AlterColumnNullability,
    AlterColumnType,
    CreateIndex,
    CreateTable,
    DropColumn,
    DropForeignKey,
    DropIndex,
    DropTable,
    MigrationOp,
    MigrationPlan,
)


def diff_schemas(desired: SchemaIR, current: SchemaIR) -> MigrationPlan:
    """Compare ``desired`` vs ``current`` and return an ordered migration plan."""
    desired_by_name = {t.name: t for t in desired.tables}
    current_by_name = {t.name: t for t in current.tables}

    desired_names = set(desired_by_name)
    current_names = set(current_by_name)

    create_names = desired_names - current_names
    drop_names = current_names - desired_names
    shared_names = desired_names & current_names

    ops: list[MigrationOp] = []

    # 1. Drop FKs that will be removed or that sit on tables about to change/drop.
    for name in sorted(shared_names):
        desired_table = desired_by_name[name]
        current_table = current_by_name[name]
        desired_fks = {fk.name: fk for fk in desired_table.foreign_keys}
        current_fks = {fk.name: fk for fk in current_table.foreign_keys}
        for fk_name in sorted(current_fks.keys() - desired_fks.keys()):
            ops.append(DropForeignKey(table_name=name, constraint_name=fk_name))
        for fk_name in sorted(desired_fks.keys() & current_fks.keys()):
            if desired_fks[fk_name] != current_fks[fk_name]:
                ops.append(DropForeignKey(table_name=name, constraint_name=fk_name))

    for name in sorted(drop_names):
        for fk in current_by_name[name].foreign_keys:
            ops.append(DropForeignKey(table_name=name, constraint_name=fk.name))

    # 1b. Drop indexes that will be removed or changed (before column/table drops).
    for name in sorted(shared_names):
        desired_idxs = {i.name: i for i in desired_by_name[name].indexes}
        current_idxs = {i.name: i for i in current_by_name[name].indexes}
        for idx_name in sorted(current_idxs.keys() - desired_idxs.keys()):
            ops.append(DropIndex(index_name=idx_name))
        for idx_name in sorted(desired_idxs.keys() & current_idxs.keys()):
            if desired_idxs[idx_name] != current_idxs[idx_name]:
                ops.append(DropIndex(index_name=idx_name))

    for name in sorted(drop_names):
        for idx in current_by_name[name].indexes:
            ops.append(DropIndex(index_name=idx.name))

    # 2. Column drops / alters on shared tables (before table drops).
    for name in sorted(shared_names):
        ops.extend(_diff_columns(desired_by_name[name], current_by_name[name]))

    # 3. Drop tables (dependents before dependencies).
    for name in _topo_sort(drop_names, current_by_name, reverse=True):
        ops.append(DropTable(table_name=name))

    # 4. Create tables (dependencies before dependents); FKs/indexes added later.
    for name in _topo_sort(create_names, desired_by_name, reverse=False):
        table = desired_by_name[name]
        ops.append(CreateTable(table=_table_without_fks_or_indexes(table)))

    # 5. Add columns on shared tables.
    for name in sorted(shared_names):
        desired_table = desired_by_name[name]
        current_table = current_by_name[name]
        current_cols = {c.name for c in current_table.columns}
        for col in sorted(desired_table.columns, key=lambda c: c.name):
            if col.name not in current_cols:
                ops.append(AddColumn(table_name=name, column=col))

    # 6. Add indexes (new tables + shared tables missing/changed indexes).
    for name in sorted(desired_names):
        desired_table = desired_by_name[name]
        current_table = current_by_name.get(name)
        current_idxs = (
            {idx.name: idx for idx in current_table.indexes} if current_table else {}
        )
        for idx in sorted(desired_table.indexes, key=lambda item: item.name):
            existing = current_idxs.get(idx.name)
            if existing is None or existing != idx:
                ops.append(CreateIndex(table_name=name, index=idx))

    # 7. Add FKs (new tables + shared tables missing/changed FKs).
    for name in _topo_sort(desired_names, desired_by_name, reverse=False):
        desired_table = desired_by_name[name]
        current_table = current_by_name.get(name)
        current_fks = (
            {fk.name: fk for fk in current_table.foreign_keys} if current_table else {}
        )
        for fk in sorted(desired_table.foreign_keys, key=lambda item: item.name):
            existing = current_fks.get(fk.name)
            if existing is None or existing != fk:
                ops.append(AddForeignKey(table_name=name, foreign_key=fk))

    return MigrationPlan(ops=tuple(ops))


def _table_without_fks_or_indexes(table: TableIR) -> TableIR:
    return TableIR(
        name=table.name,
        columns=table.columns,
        primary_key=table.primary_key,
        foreign_keys=(),
        indexes=(),
        checks=table.checks,
    )


def _diff_columns(desired: TableIR, current: TableIR) -> list[MigrationOp]:
    ops: list[MigrationOp] = []
    desired_cols = {c.name: c for c in desired.columns}
    current_cols = {c.name: c for c in current.columns}

    for name in sorted(current_cols.keys() - desired_cols.keys()):
        ops.append(DropColumn(table_name=desired.name, column_name=name))

    for name in sorted(desired_cols.keys() & current_cols.keys()):
        want = desired_cols[name]
        have = current_cols[name]
        if want.type_name != have.type_name:
            ops.append(
                AlterColumnType(
                    table_name=desired.name,
                    column_name=name,
                    from_type=have.type_name,
                    to_type=want.type_name,
                )
            )
        if want.nullable != have.nullable:
            ops.append(
                AlterColumnNullability(
                    table_name=desired.name,
                    column_name=name,
                    nullable=want.nullable,
                )
            )
    return ops


def _topo_sort(
    names: set[str],
    tables: dict[str, TableIR],
    *,
    reverse: bool,
) -> list[str]:
    """Order ``names`` by FK dependencies among that subset.

    ``reverse=False`` → dependencies first (create). ``reverse=True`` → dependents
    first (drop).
    """
    subset = {n for n in names if n in tables}
    deps: dict[str, set[str]] = {n: set() for n in subset}
    for name in subset:
        for fk in tables[name].foreign_keys:
            if fk.referenced_table in subset and fk.referenced_table != name:
                deps[name].add(fk.referenced_table)

    if reverse:
        # Invert edges: dependency → dependents, then Kahn for drop order.
        dependents: dict[str, set[str]] = {n: set() for n in subset}
        for name, parents in deps.items():
            for parent in parents:
                dependents[parent].add(name)
        deps = dependents

    indegree = {n: len(deps[n]) for n in subset}
    queue = deque(sorted(n for n in subset if indegree[n] == 0))
    ordered: list[str] = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for other in sorted(subset):
            if node in deps[other]:
                indegree[other] -= 1
                if indegree[other] == 0:
                    queue.append(other)

    if len(ordered) != len(subset):
        # Cycle (e.g. mutual FKs): fall back to sorted names for determinism.
        return sorted(subset)
    return ordered
