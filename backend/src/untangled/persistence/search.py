"""Definition-driven predicate search: validate, compile parameterized SQL, execute."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from psycopg import Connection, sql
from psycopg.errors import InvalidRegularExpression
from psycopg.rows import dict_row
from pydantic import TypeAdapter, ValidationError

from untangled.mapping.datetime_utc import format_utc_iso_z, require_utc_seconds
from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELDS
from untangled.persistence.fk_enrichment import (
    RelatedIdentity,
    build_enriched_read_plan,
    map_enriched_row,
    qualify_source_column,
)

DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 200

SortDirection = Literal["asc", "desc"]

IMPLEMENTED_OPS: frozenset[str] = frozenset(
    {
        "and",
        "or",
        "not",
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "empty",
        "not_empty",
        "contains",
        "starts_with",
        "ends_with",
        "regexp",
    }
)

_VALUE_OPS = frozenset({"eq", "ne"})
_ORDERED_OPS = frozenset({"gt", "gte", "lt", "lte"})
# Text-family YAML types share string operator eligibility (incl. deprecated
# ``string``). ``multiline_text`` keeps parity for M1; pattern/ordered filters
# on long text may scan heavily — tracked as follow-on performance debt.
_TEXT_FAMILY_SEARCH_TYPES = frozenset(
    {
        "string",
        "compact_text",
        "choice",
        "status",
        "text",
        "multiline_text",
    }
)
_ORDERED_TYPES = frozenset(
    {
        *_TEXT_FAMILY_SEARCH_TYPES,
        "integer",
        "float",
        "decimal",
        "datetime",
        "friendly_id",
    }
)
_TEXT_ORDERED_TYPES = frozenset({*_TEXT_FAMILY_SEARCH_TYPES, "friendly_id"})
_ORDERED_SQL = {
    "gt": sql.SQL(">"),
    "gte": sql.SQL(">="),
    "lt": sql.SQL("<"),
    "lte": sql.SQL("<="),
}
_TEXT_PATTERN_OPS = frozenset({"contains", "starts_with", "ends_with", "regexp"})
_TEXT_PATTERN_TYPES = frozenset({*_TEXT_FAMILY_SEARCH_TYPES, "friendly_id"})
_LIKE_ESCAPE_CHAR = "\\"

_TYPE_ADAPTERS: dict[str, TypeAdapter[Any]] = {
    "string": TypeAdapter(str),
    "compact_text": TypeAdapter(str),
    "choice": TypeAdapter(str),
    "status": TypeAdapter(str),
    "text": TypeAdapter(str),
    "multiline_text": TypeAdapter(str),
    "friendly_id": TypeAdapter(str),
    "boolean": TypeAdapter(bool),
    "integer": TypeAdapter(int),
    "float": TypeAdapter(float),
    "decimal": TypeAdapter(Decimal),
    "uuid": TypeAdapter(UUID),
    "datetime": TypeAdapter(datetime),
}


class SearchValidationError(ValueError):
    """Invalid search request (base for compiler validation failures)."""


class SearchStructuralError(SearchValidationError):
    """Malformed request shape, unexpected keys, or absent required children."""


class SearchSemanticError(SearchValidationError):
    """Invalid values, ranges, enums, or domain/rule failures."""


@dataclass(frozen=True, slots=True)
class SearchableAttribute:
    """One searchable column: snake_case name and YAML/system type name."""

    name: str
    type_name: str


@dataclass(frozen=True, slots=True)
class SearchResult:
    """Projected rows plus pagination metadata."""

    items: list[dict[str, Any]]
    limit: int
    offset: int
    total: int


@dataclass(frozen=True, slots=True)
class SearchNestingLimits:
    """Search tree budgets supplied by the caller (from system-config).

    Persistence enforces only; it does not load or invent these values.

    Counting: every node with an ``op`` counts toward ``max_total_predicates``;
    each ``regexp`` node also counts toward ``max_total_regexp``. Depth uses
    root depth 1; length is children in one ``and``/``or`` ``predicates`` array.
    """

    max_depth: int
    max_length: int
    max_total_predicates: int
    max_total_regexp: int


@dataclass(slots=True)
class _CompileBudget:
    limits: SearchNestingLimits
    total_predicates: int = 0
    total_regexp: int = 0

    def count_node(self, op: str) -> None:
        self.total_predicates += 1
        if self.total_predicates > self.limits.max_total_predicates:
            raise SearchSemanticError(
                "predicate tree exceeds maximum of "
                f"{self.limits.max_total_predicates} total predicates "
                f"(max_search_total_predicates)"
            )
        if op == "regexp":
            self.total_regexp += 1
            if self.total_regexp > self.limits.max_total_regexp:
                raise SearchSemanticError(
                    "predicate tree exceeds maximum of "
                    f"{self.limits.max_total_regexp} regexp predicates "
                    f"(max_search_total_regexp)"
                )


def searchable_attributes(definition: ClassDefinition) -> dict[str, SearchableAttribute]:
    """All mapped attributes for a class, including injected system fields."""
    attrs: dict[str, SearchableAttribute] = {
        field.name: SearchableAttribute(field.name, field.type_name)
        for field in SYSTEM_FIELDS
    }
    for attr in definition.attributes:
        attrs[attr.name_snake] = SearchableAttribute(attr.name_snake, attr.type_name)
    return attrs


def execute_search(
    conn: Connection,
    definition: ClassDefinition,
    *,
    limits: SearchNestingLimits,
    predicate: dict[str, Any] | None = None,
    sort: list[tuple[str, SortDirection]] | None = None,
    attributes: list[str] | None = None,
    limit: int | None = None,
    offset: int | None = None,
    enrich_fk_identity: bool = False,
    definitions_by_name: dict[str, ClassDefinition] | None = None,
    id_only_attributes: bool = False,
) -> SearchResult:
    """Validate request, run COUNT + SELECT, return projected items.

    ``limits`` are required (caller loads from system-config). When
    ``enrich_fk_identity`` is true, the SELECT uses bounded LEFT JOINs for
    projected FK fields and items may contain ``RelatedIdentity`` values.
    COUNT remains unjoined. Predicates and sorts still use source columns.

    When ``id_only_attributes`` is true (search without effective class read),
    only ``id`` is a known attribute for projection, predicates, and caller
    sort — other names fail like unknown attributes. Internal stability sort
    columns are unchanged.
    """
    attrs = searchable_attributes(definition)
    if id_only_attributes:
        id_attr = attrs.get("id")
        if id_attr is None:
            raise RuntimeError("class searchable attributes missing required 'id'")
        attrs = {"id": id_attr}
        enrich_fk_identity = False
    resolved_limit = _resolve_limit(limit)
    resolved_offset = _resolve_offset(offset)
    select_columns = _resolve_projection(attributes, attrs)
    order_by = _resolve_sort(sort, attrs)

    # COUNT never joins; compile an unqualified WHERE for it.
    count_where, count_params = _compile_predicate_root(
        predicate, attrs, limits=limits, qualify_source=False
    )
    table = sql.Identifier(definition.name_snake)
    count_query = sql.SQL("SELECT COUNT(*) FROM {} WHERE {}").format(
        table, count_where
    )

    select_where, select_params_base = _compile_predicate_root(
        predicate, attrs, limits=limits, qualify_source=enrich_fk_identity
    )

    if enrich_fk_identity:
        if definitions_by_name is None:
            raise RuntimeError(
                "definitions_by_name is required when enrich_fk_identity is true"
            )
        plan = build_enriched_read_plan(
            definition, definitions_by_name, select_columns
        )
        order_sql = sql.SQL(", ").join(
            sql.SQL("{} {}").format(
                qualify_source_column(name),
                sql.SQL("ASC") if direction == "asc" else sql.SQL("DESC"),
            )
            for name, direction in order_by
        )
        select_query = sql.SQL(
            "SELECT {} FROM {} WHERE {} ORDER BY {} LIMIT {} OFFSET {}"
        ).format(
            plan.select_list,
            plan.from_clause,
            select_where,
            order_sql,
            sql.Placeholder(),
            sql.Placeholder(),
        )
    else:
        plan = None
        select_list = sql.SQL(", ").join(sql.Identifier(c) for c in select_columns)
        order_sql = sql.SQL(", ").join(
            sql.SQL("{} {}").format(
                sql.Identifier(name),
                sql.SQL("ASC") if direction == "asc" else sql.SQL("DESC"),
            )
            for name, direction in order_by
        )
        select_query = sql.SQL(
            "SELECT {} FROM {} WHERE {} ORDER BY {} LIMIT {} OFFSET {}"
        ).format(
            select_list,
            table,
            select_where,
            order_sql,
            sql.Placeholder(),
            sql.Placeholder(),
        )

    select_params = [*select_params_base, resolved_limit, resolved_offset]
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(count_query, count_params)
            count_row = cur.fetchone()
            assert count_row is not None
            total = int(count_row["count"])
            cur.execute(select_query, select_params)
            rows = cur.fetchall()
    except InvalidRegularExpression as exc:
        # SQLSTATE 2201B from a client regexp pattern — semantic, not a server fault.
        conn.rollback()
        raise SearchSemanticError(
            "invalid regular expression in regexp predicate"
        ) from exc

    if plan is not None:
        items = [
            _serialize_enriched_row(map_enriched_row(dict(row), plan), select_columns)
            for row in rows
        ]
    else:
        items = [_serialize_row(dict(row), select_columns) for row in rows]
    return SearchResult(
        items=items,
        limit=resolved_limit,
        offset=resolved_offset,
        total=total,
    )


def _resolve_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_SEARCH_LIMIT
    if not isinstance(limit, int) or isinstance(limit, bool):
        raise SearchSemanticError("limit must be an integer")
    if limit < 1 or limit > MAX_SEARCH_LIMIT:
        raise SearchSemanticError(
            f"limit must be between 1 and {MAX_SEARCH_LIMIT} (got {limit})"
        )
    return limit


def _resolve_offset(offset: int | None) -> int:
    if offset is None:
        return 0
    if not isinstance(offset, int) or isinstance(offset, bool):
        raise SearchSemanticError("offset must be an integer")
    if offset < 0:
        raise SearchSemanticError(f"offset must be non-negative (got {offset})")
    return offset


def _resolve_projection(
    attributes: list[str] | None,
    attrs: dict[str, SearchableAttribute],
) -> list[str]:
    columns = ["id"]
    seen = {"id"}
    if not attributes:
        return columns
    for name in attributes:
        if name not in attrs:
            raise SearchSemanticError(f"unknown attribute: {name!r}")
        if name in seen:
            continue
        seen.add(name)
        columns.append(name)
    return columns


def _resolve_sort(
    sort: list[tuple[str, SortDirection]] | None,
    attrs: dict[str, SearchableAttribute],
) -> list[tuple[str, SortDirection]]:
    """Apply caller sort keys then stability suffix.

    Directions must already be normalised ``asc``/``desc`` at the protocol edge.
    A bad direction here is a programming error, not a client validation failure.
    """
    order: list[tuple[str, SortDirection]] = []
    seen: set[str] = set()
    for attribute, direction in sort or []:
        if attribute not in attrs:
            raise SearchSemanticError(f"unknown sort attribute: {attribute!r}")
        if direction not in ("asc", "desc"):
            raise RuntimeError(
                f"invalid sort direction reached persistence: {direction!r}"
            )
        order.append((attribute, direction))
        seen.add(attribute)
    if "created_at" not in seen:
        order.append(("created_at", "desc"))
    if "id" not in seen:
        order.append(("id", "desc"))
    return order


def _compile_predicate_root(
    predicate: dict[str, Any] | None,
    attrs: dict[str, SearchableAttribute],
    *,
    limits: SearchNestingLimits,
    qualify_source: bool = False,
) -> tuple[sql.Composable, list[Any]]:
    if predicate is None:
        return sql.SQL("TRUE"), []
    if not isinstance(predicate, dict):
        raise SearchStructuralError("predicate must be an object or null")
    params: list[Any] = []
    budget = _CompileBudget(limits=limits)
    compiled = _compile_predicate(
        predicate,
        attrs,
        depth=1,
        params=params,
        budget=budget,
        qualify_source=qualify_source,
    )
    return compiled, params


def _compile_predicate(
    node: Any,
    attrs: dict[str, SearchableAttribute],
    *,
    depth: int,
    params: list[Any],
    budget: _CompileBudget,
    qualify_source: bool,
) -> sql.Composable:
    if depth > budget.limits.max_depth:
        raise SearchSemanticError(
            "predicate nesting depth exceeds maximum of "
            f"{budget.limits.max_depth} (max_search_nesting_depth)"
        )
    if not isinstance(node, dict):
        raise SearchStructuralError("each predicate node must be an object")
    if "op" not in node:
        raise SearchStructuralError("predicate node requires 'op'")
    op = node["op"]
    if not isinstance(op, str):
        raise SearchSemanticError("predicate 'op' must be a string")
    if op not in IMPLEMENTED_OPS:
        raise SearchSemanticError(f"unknown operator: {op!r}")

    budget.count_node(op)

    if op in {"and", "or"}:
        return _compile_logical_list(
            op,
            node,
            attrs,
            depth=depth,
            params=params,
            budget=budget,
            qualify_source=qualify_source,
        )
    if op == "not":
        return _compile_not(
            node,
            attrs,
            depth=depth,
            params=params,
            budget=budget,
            qualify_source=qualify_source,
        )
    if op in _VALUE_OPS:
        return _compile_comparison(
            op, node, attrs, params=params, qualify_source=qualify_source
        )
    if op in _ORDERED_OPS:
        return _compile_ordered_comparison(
            op, node, attrs, params=params, qualify_source=qualify_source
        )
    if op in _TEXT_PATTERN_OPS:
        return _compile_text_pattern(
            op, node, attrs, params=params, qualify_source=qualify_source
        )
    return _compile_null_check(op, node, attrs, qualify_source=qualify_source)


def _column_ref(name: str, *, qualify_source: bool) -> sql.Composable:
    if qualify_source:
        return qualify_source_column(name)
    return sql.Identifier(name)


def _unexpected_keys(node: dict[str, Any], allowed: set[str]) -> None:
    extra = set(node) - allowed
    if extra:
        raise SearchStructuralError(
            f"unexpected predicate properties: {sorted(extra)}"
        )


def _compile_logical_list(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    depth: int,
    params: list[Any],
    budget: _CompileBudget,
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "predicates"})
    children = node.get("predicates")
    if not isinstance(children, list):
        raise SearchStructuralError(
            f"{op!r} requires a non-empty 'predicates' array"
        )
    if len(children) == 0:
        # Empty required child collection → structural (same taxonomy as #56 /
        # request_validation.STRUCTURAL_VALIDATION_TYPES).
        raise SearchStructuralError(
            f"{op!r} requires a non-empty 'predicates' array"
        )
    if len(children) > budget.limits.max_length:
        raise SearchSemanticError(
            f"{op!r} 'predicates' length exceeds maximum of "
            f"{budget.limits.max_length} (max_search_nesting_length; "
            f"got {len(children)})"
        )
    parts = [
        _compile_predicate(
            child,
            attrs,
            depth=depth + 1,
            params=params,
            budget=budget,
            qualify_source=qualify_source,
        )
        for child in children
    ]
    joiner = sql.SQL(" AND ") if op == "and" else sql.SQL(" OR ")
    return sql.SQL("({})").format(joiner.join(parts))


def _compile_not(
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    depth: int,
    params: list[Any],
    budget: _CompileBudget,
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "predicate"})
    if "predicate" not in node:
        raise SearchStructuralError("'not' requires a 'predicate' child")
    child = _compile_predicate(
        node["predicate"],
        attrs,
        depth=depth + 1,
        params=params,
        budget=budget,
        qualify_source=qualify_source,
    )
    return sql.SQL("NOT ({})").format(child)


def _compile_comparison(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute", "value"})
    attr = _require_attribute(node, attrs)
    if "value" not in node:
        raise SearchStructuralError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchSemanticError(
            f"{op!r} does not accept value: null; use empty / not_empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    params.append(typed)
    operator = sql.SQL("=") if op == "eq" else sql.SQL("<>")
    return sql.SQL("{} {} {}").format(
        _column_ref(attr.name, qualify_source=qualify_source),
        operator,
        sql.Placeholder(),
    )


def _compile_ordered_comparison(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute", "value"})
    attr = _require_attribute(node, attrs)
    if attr.type_name not in _ORDERED_TYPES:
        raise SearchSemanticError(
            f"operator {op!r} is not applicable to attribute {attr.name!r} "
            f"(type {attr.type_name!r}; requires an ordered type)"
        )
    if "value" not in node:
        raise SearchStructuralError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchSemanticError(
            f"{op!r} does not accept value: null; use empty / not_empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    params.append(typed)
    column: sql.Composable = _column_ref(attr.name, qualify_source=qualify_source)
    if attr.type_name in _TEXT_ORDERED_TYPES:
        # Pin byte/codepoint order so case-sensitive text bounds are portable
        # across database locales (see docs; text sort collation is separate).
        column = sql.SQL('{} COLLATE "C"').format(column)
    return sql.SQL("{} {} {}").format(
        column,
        _ORDERED_SQL[op],
        sql.Placeholder(),
    )


def _compile_null_check(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute"})
    attr = _require_attribute(node, attrs)
    column = _column_ref(attr.name, qualify_source=qualify_source)
    if op == "empty":
        return sql.SQL("{} IS NULL").format(column)
    return sql.SQL("{} IS NOT NULL").format(column)


def _compile_text_pattern(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
    qualify_source: bool,
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute", "value"})
    attr = _require_attribute(node, attrs)
    if attr.type_name not in _TEXT_PATTERN_TYPES:
        raise SearchSemanticError(
            f"operator {op!r} is not applicable to attribute {attr.name!r} "
            f"(type {attr.type_name!r}; requires a text-family type or friendly_id)"
        )
    if "value" not in node:
        raise SearchStructuralError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchSemanticError(
            f"{op!r} does not accept value: null; use empty / not_empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    if not isinstance(typed, str):
        raise SearchSemanticError(
            f"value for attribute {attr.name!r} must be a string for operator {op!r}"
        )
    column = _column_ref(attr.name, qualify_source=qualify_source)
    if op == "regexp":
        params.append(typed)
        return sql.SQL("{} ~ {}").format(column, sql.Placeholder())

    escaped = _escape_like_literal(typed)
    if op == "contains":
        pattern = f"%{escaped}%"
    elif op == "starts_with":
        pattern = f"{escaped}%"
    else:
        pattern = f"%{escaped}"
    params.append(pattern)
    return sql.SQL("{} LIKE {} ESCAPE {}").format(
        column,
        sql.Placeholder(),
        sql.Literal(_LIKE_ESCAPE_CHAR),
    )


def _escape_like_literal(value: str) -> str:
    """Escape LIKE metacharacters so the value is matched as a literal substring."""
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def _require_attribute(
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
) -> SearchableAttribute:
    if "attribute" not in node:
        raise SearchStructuralError("comparison predicate requires 'attribute'")
    name = node["attribute"]
    if not isinstance(name, str) or not name:
        raise SearchSemanticError("comparison predicate 'attribute' must be a non-empty string")
    try:
        return attrs[name]
    except KeyError as exc:
        raise SearchSemanticError(f"unknown attribute: {name!r}") from exc


def _coerce_value(attr: SearchableAttribute, raw: Any) -> Any:
    adapter = _TYPE_ADAPTERS.get(attr.type_name)
    if adapter is None:
        raise SearchSemanticError(
            f"unsupported attribute type for search: {attr.type_name!r}"
        )
    try:
        value = adapter.validate_python(raw)
    except ValidationError as exc:
        raise SearchSemanticError(
            f"value for attribute {attr.name!r} ({attr.type_name}) is invalid: {exc}"
        ) from exc
    if attr.type_name == "datetime":
        if value.tzinfo is None:
            raise SearchSemanticError(
                f"value for attribute {attr.name!r} must be timezone-aware (UTC)"
            )
        return require_utc_seconds(value)
    return value


def _serialize_row(row: dict[str, Any], columns: list[str]) -> dict[str, Any]:
    """JSON-boundary serialization matching generated model conventions."""
    out: dict[str, Any] = {}
    for name in columns:
        value = row[name]
        if isinstance(value, UUID):
            out[name] = str(value)
        elif isinstance(value, datetime):
            out[name] = format_utc_iso_z(value)
        elif isinstance(value, Decimal):
            out[name] = str(value)
        else:
            out[name] = value
    return out


def _serialize_enriched_row(
    row: dict[str, Any], columns: list[str]
) -> dict[str, Any]:
    """Serialize scalars for the wire; leave RelatedIdentity for the protocol layer."""
    out: dict[str, Any] = {}
    for name in columns:
        value = row[name]
        if isinstance(value, RelatedIdentity):
            out[name] = value
        elif isinstance(value, UUID):
            out[name] = str(value)
        elif isinstance(value, datetime):
            out[name] = format_utc_iso_z(value)
        elif isinstance(value, Decimal):
            out[name] = str(value)
        else:
            out[name] = value
    return out
