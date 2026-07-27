"""Definition-driven predicate search: validate, compile parameterized SQL, execute."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from psycopg import Connection, sql
from psycopg.errors import InvalidRegularExpression
from psycopg.rows import dict_row
from pydantic import TypeAdapter, ValidationError

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELDS

# Hard-coded M1 guardrails (not system-configurable yet).
MAX_SEARCH_NESTING_DEPTH = 3
MAX_SEARCH_NESTING_LENGTH = 50
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
        "not-empty",
        "contains",
        "starts-with",
        "ends-with",
        "regexp",
    }
)

_VALUE_OPS = frozenset({"eq", "ne"})
_ORDERED_OPS = frozenset({"gt", "gte", "lt", "lte"})
# Text-family YAML types share string operator eligibility (incl. deprecated
# ``string``). ``multiline-text`` keeps parity for M1; pattern/ordered filters
# on long text may scan heavily — tracked as follow-on performance debt.
_TEXT_FAMILY_SEARCH_TYPES = frozenset(
    {
        "string",
        "compact-text",
        "choice",
        "status",
        "text",
        "multiline-text",
    }
)
_ORDERED_TYPES = frozenset(
    {
        *_TEXT_FAMILY_SEARCH_TYPES,
        "integer",
        "float",
        "decimal",
        "datetime",
        "friendly-id",
    }
)
_TEXT_ORDERED_TYPES = frozenset({*_TEXT_FAMILY_SEARCH_TYPES, "friendly-id"})
_ORDERED_SQL = {
    "gt": sql.SQL(">"),
    "gte": sql.SQL(">="),
    "lt": sql.SQL("<"),
    "lte": sql.SQL("<="),
}
_TEXT_PATTERN_OPS = frozenset({"contains", "starts-with", "ends-with", "regexp"})
_TEXT_PATTERN_TYPES = frozenset({*_TEXT_FAMILY_SEARCH_TYPES, "friendly-id"})
_LIKE_ESCAPE_CHAR = "\\"

_TYPE_ADAPTERS: dict[str, TypeAdapter[Any]] = {
    "string": TypeAdapter(str),
    "compact-text": TypeAdapter(str),
    "choice": TypeAdapter(str),
    "status": TypeAdapter(str),
    "text": TypeAdapter(str),
    "multiline-text": TypeAdapter(str),
    "friendly-id": TypeAdapter(str),
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
    predicate: dict[str, Any] | None = None,
    sort: list[tuple[str, SortDirection]] | None = None,
    attributes: list[str] | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> SearchResult:
    """Validate request, run COUNT + SELECT, return projected items."""
    attrs = searchable_attributes(definition)
    resolved_limit = _resolve_limit(limit)
    resolved_offset = _resolve_offset(offset)
    select_columns = _resolve_projection(attributes, attrs)
    order_by = _resolve_sort(sort, attrs)
    where_sql, params = _compile_predicate_root(predicate, attrs)

    table = sql.Identifier(definition.name_snake)
    count_query = sql.SQL("SELECT COUNT(*) FROM {} WHERE {}").format(table, where_sql)
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
        where_sql,
        order_sql,
        sql.Placeholder(),
        sql.Placeholder(),
    )

    select_params = [*params, resolved_limit, resolved_offset]
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(count_query, params)
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
) -> tuple[sql.Composable, list[Any]]:
    if predicate is None:
        return sql.SQL("TRUE"), []
    if not isinstance(predicate, dict):
        raise SearchStructuralError("predicate must be an object or null")
    params: list[Any] = []
    compiled = _compile_predicate(predicate, attrs, depth=1, params=params)
    return compiled, params


def _compile_predicate(
    node: Any,
    attrs: dict[str, SearchableAttribute],
    *,
    depth: int,
    params: list[Any],
) -> sql.Composable:
    if depth > MAX_SEARCH_NESTING_DEPTH:
        raise SearchSemanticError(
            f"predicate nesting depth exceeds maximum of {MAX_SEARCH_NESTING_DEPTH}"
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

    if op in {"and", "or"}:
        return _compile_logical_list(op, node, attrs, depth=depth, params=params)
    if op == "not":
        return _compile_not(node, attrs, depth=depth, params=params)
    if op in _VALUE_OPS:
        return _compile_comparison(op, node, attrs, params=params)
    if op in _ORDERED_OPS:
        return _compile_ordered_comparison(op, node, attrs, params=params)
    if op in _TEXT_PATTERN_OPS:
        return _compile_text_pattern(op, node, attrs, params=params)
    return _compile_null_check(op, node, attrs)


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
    if len(children) > MAX_SEARCH_NESTING_LENGTH:
        raise SearchSemanticError(
            f"{op!r} 'predicates' length exceeds maximum of "
            f"{MAX_SEARCH_NESTING_LENGTH} (got {len(children)})"
        )
    parts = [
        _compile_predicate(child, attrs, depth=depth + 1, params=params)
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
) -> sql.Composable:
    _unexpected_keys(node, {"op", "predicate"})
    if "predicate" not in node:
        raise SearchStructuralError("'not' requires a 'predicate' child")
    child = _compile_predicate(node["predicate"], attrs, depth=depth + 1, params=params)
    return sql.SQL("NOT ({})").format(child)


def _compile_comparison(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute", "value"})
    attr = _require_attribute(node, attrs)
    if "value" not in node:
        raise SearchStructuralError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchSemanticError(
            f"{op!r} does not accept value: null; use empty / not-empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    params.append(typed)
    operator = sql.SQL("=") if op == "eq" else sql.SQL("<>")
    return sql.SQL("{} {} {}").format(
        sql.Identifier(attr.name),
        operator,
        sql.Placeholder(),
    )


def _compile_ordered_comparison(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
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
            f"{op!r} does not accept value: null; use empty / not-empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    params.append(typed)
    column: sql.Composable = sql.Identifier(attr.name)
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
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute"})
    attr = _require_attribute(node, attrs)
    if op == "empty":
        return sql.SQL("{} IS NULL").format(sql.Identifier(attr.name))
    return sql.SQL("{} IS NOT NULL").format(sql.Identifier(attr.name))


def _compile_text_pattern(
    op: str,
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
    *,
    params: list[Any],
) -> sql.Composable:
    _unexpected_keys(node, {"op", "attribute", "value"})
    attr = _require_attribute(node, attrs)
    if attr.type_name not in _TEXT_PATTERN_TYPES:
        raise SearchSemanticError(
            f"operator {op!r} is not applicable to attribute {attr.name!r} "
            f"(type {attr.type_name!r}; requires a text-family type or friendly-id)"
        )
    if "value" not in node:
        raise SearchStructuralError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchSemanticError(
            f"{op!r} does not accept value: null; use empty / not-empty for null checks"
        )
    typed = _coerce_value(attr, raw)
    if not isinstance(typed, str):
        raise SearchSemanticError(
            f"value for attribute {attr.name!r} must be a string for operator {op!r}"
        )
    if op == "regexp":
        params.append(typed)
        return sql.SQL("{} ~ {}").format(sql.Identifier(attr.name), sql.Placeholder())

    escaped = _escape_like_literal(typed)
    if op == "contains":
        pattern = f"%{escaped}%"
    elif op == "starts-with":
        pattern = f"{escaped}%"
    else:
        pattern = f"%{escaped}"
    params.append(pattern)
    return sql.SQL("{} LIKE {} ESCAPE {}").format(
        sql.Identifier(attr.name),
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
        return value.astimezone(timezone.utc)
    return value


def _serialize_row(row: dict[str, Any], columns: list[str]) -> dict[str, Any]:
    """JSON-boundary serialization matching generated model conventions."""
    out: dict[str, Any] = {}
    for name in columns:
        value = row[name]
        if isinstance(value, UUID):
            out[name] = str(value)
        elif isinstance(value, datetime):
            out[name] = value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        elif isinstance(value, Decimal):
            out[name] = str(value)
        else:
            out[name] = value
    return out
