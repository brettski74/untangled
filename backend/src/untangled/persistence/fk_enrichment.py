"""Definition-driven FK identity projection for versioned read queries.

Persistence returns neutral related-identity values. HTTP/protocol layers own
wire member names (``display_name`` / ``friendly_id``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping
from uuid import UUID

from psycopg import sql

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import AUDIT_USER_TABLE

# Injected audit FKs always target the required system ``user`` class.
AUDIT_FK_COLUMNS: frozenset[str] = frozenset({"created_by", "updated_by"})


@dataclass(frozen=True, slots=True)
class RelatedIdentity:
    """Neutral related-record identity (not an HTTP wire object)."""

    id: UUID
    has_display: bool
    display_value: str | None
    has_friendly: bool
    friendly_value: str | None


@dataclass(frozen=True, slots=True)
class FkJoinSpec:
    """One projected FK LEFT JOIN and its selected identity columns."""

    source_column: str
    target_table: str
    join_alias: str
    display_column: str | None
    friendly_column: str | None
    display_select_alias: str | None
    friendly_select_alias: str | None


@dataclass(frozen=True, slots=True)
class EnrichedReadPlan:
    """SQL fragments and join metadata for an enriched SELECT."""

    source_columns: tuple[str, ...]
    joins: tuple[FkJoinSpec, ...]
    select_list: sql.Composable
    from_clause: sql.Composable


def resolve_fk_fields(
    definition: ClassDefinition,
    projected_columns: list[str],
) -> list[tuple[str, str]]:
    """Return ``(source_column, target_class_kebab)`` for projected FK fields."""
    projected = set(projected_columns)
    out: list[tuple[str, str]] = []
    for attr in definition.attributes:
        if attr.references is None:
            continue
        if attr.name_snake not in projected:
            continue
        out.append((attr.name_snake, attr.references))
    for column in ("created_by", "updated_by"):
        if column in projected:
            out.append((column, "user"))
    return out


def build_enriched_read_plan(
    definition: ClassDefinition,
    definitions_by_kebab: Mapping[str, ClassDefinition],
    projected_columns: list[str],
) -> EnrichedReadPlan:
    """Build SELECT list + FROM/JOIN for projected columns with FK enrichment."""
    source_alias = "src"
    source_table = definition.name_snake
    fk_fields = resolve_fk_fields(definition, projected_columns)

    joins: list[FkJoinSpec] = []
    select_parts: list[sql.Composable] = [
        sql.SQL("{}.{}").format(sql.Identifier(source_alias), sql.Identifier(col))
        for col in projected_columns
    ]

    for source_column, target_kebab in fk_fields:
        try:
            target = definitions_by_kebab[target_kebab]
        except KeyError as exc:
            raise RuntimeError(
                f"FK {definition.name_kebab}.{source_column} references unknown "
                f"class {target_kebab!r}"
            ) from exc
        if target_kebab == "user" and target.name_snake != AUDIT_USER_TABLE:
            raise RuntimeError("audit FK target must resolve to system user class")

        join_alias = f"fk__{source_column}"
        display_attr = target.display_attribute
        friendly_attr = target.friendly_id_attr()
        display_column = display_attr.name_snake if display_attr is not None else None
        friendly_column = (
            friendly_attr.name_snake if friendly_attr is not None else None
        )
        display_select_alias = (
            f"{join_alias}__display" if display_column is not None else None
        )
        friendly_select_alias = (
            f"{join_alias}__friendly" if friendly_column is not None else None
        )
        joins.append(
            FkJoinSpec(
                source_column=source_column,
                target_table=target.name_snake,
                join_alias=join_alias,
                display_column=display_column,
                friendly_column=friendly_column,
                display_select_alias=display_select_alias,
                friendly_select_alias=friendly_select_alias,
            )
        )
        if display_column is not None and display_select_alias is not None:
            select_parts.append(
                sql.SQL("{}.{} AS {}").format(
                    sql.Identifier(join_alias),
                    sql.Identifier(display_column),
                    sql.Identifier(display_select_alias),
                )
            )
        if friendly_column is not None and friendly_select_alias is not None:
            select_parts.append(
                sql.SQL("{}.{} AS {}").format(
                    sql.Identifier(join_alias),
                    sql.Identifier(friendly_column),
                    sql.Identifier(friendly_select_alias),
                )
            )

    join_sqls: list[sql.Composable] = [
        sql.SQL("{} AS {}").format(
            sql.Identifier(source_table),
            sql.Identifier(source_alias),
        )
    ]
    for join in joins:
        join_sqls.append(
            sql.SQL("LEFT JOIN {} AS {} ON {}.{} = {}.id").format(
                sql.Identifier(join.target_table),
                sql.Identifier(join.join_alias),
                sql.Identifier(source_alias),
                sql.Identifier(join.source_column),
                sql.Identifier(join.join_alias),
            )
        )

    return EnrichedReadPlan(
        source_columns=tuple(projected_columns),
        joins=tuple(joins),
        select_list=sql.SQL(", ").join(select_parts),
        from_clause=sql.SQL(" ").join(join_sqls),
    )


def qualify_source_column(column: str) -> sql.Composable:
    """Qualify a source-table column for enriched SELECT predicates/ORDER BY."""
    return sql.SQL("{}.{}").format(sql.Identifier("src"), sql.Identifier(column))


def map_enriched_row(
    row: Mapping[str, Any],
    plan: EnrichedReadPlan,
) -> dict[str, Any]:
    """Map a joined result row to scalars and neutral RelatedIdentity values."""
    join_by_column = {join.source_column: join for join in plan.joins}
    out: dict[str, Any] = {}
    for name in plan.source_columns:
        value = row[name]
        join = join_by_column.get(name)
        if join is None:
            out[name] = value
            continue
        if value is None:
            out[name] = None
            continue
        assert isinstance(value, UUID)
        display_value: str | None = None
        friendly_value: str | None = None
        if join.display_select_alias is not None:
            raw_display = row.get(join.display_select_alias)
            display_value = raw_display if isinstance(raw_display, str) else None
        if join.friendly_select_alias is not None:
            raw_friendly = row.get(join.friendly_select_alias)
            friendly_value = raw_friendly if isinstance(raw_friendly, str) else None
        out[name] = RelatedIdentity(
            id=value,
            has_display=join.display_column is not None,
            display_value=display_value,
            has_friendly=join.friendly_column is not None,
            friendly_value=friendly_value,
        )
    return out


def target_class_kebab_for_column(
    definition: ClassDefinition,
    column: str,
) -> str | None:
    """Return the referenced class kebab name for a column, if it is an FK."""
    if column in AUDIT_FK_COLUMNS:
        return "user"
    for attr in definition.attributes:
        if attr.name_snake == column and attr.references is not None:
            return attr.references
    return None


def definitions_index(
    definitions: list[ClassDefinition] | Mapping[str, ClassDefinition],
) -> dict[str, ClassDefinition]:
    """Index definitions by kebab-case class name."""
    if isinstance(definitions, Mapping):
        return dict(definitions)
    return {d.name_kebab: d for d in definitions}
