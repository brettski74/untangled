"""Definition-driven predicate search: validate, compile parameterized SQL, execute."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg import Connection, sql
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from untangled.mapping.definition import ClassDefinition
from untangled.mapping.system_fields import SYSTEM_FIELDS

# Hard-coded M1 guardrails (not system-configurable yet).
MAX_SEARCH_NESTING_DEPTH = 3
MAX_SEARCH_NESTING_LENGTH = 50
DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 200

# Slice A operators. B/C ops are rejected as unimplemented until those children ship.
SLICE_A_OPS: frozenset[str] = frozenset(
    {"and", "or", "not", "eq", "ne", "empty", "not-empty"}
)
DEFERRED_OPS: frozenset[str] = frozenset(
    {
        "gt",
        "gte",
        "lt",
        "lte",
        "contains",
        "starts-with",
        "ends-with",
        "regexp",
    }
)

_VALUE_OPS = frozenset({"eq", "ne"})

_TYPE_ADAPTERS: dict[str, TypeAdapter[Any]] = {
    "string": TypeAdapter(str),
    "friendly-id": TypeAdapter(str),
    "boolean": TypeAdapter(bool),
    "integer": TypeAdapter(int),
    "float": TypeAdapter(float),
    "decimal": TypeAdapter(Decimal),
    "uuid": TypeAdapter(UUID),
    "datetime": TypeAdapter(datetime),
}


class SearchValidationError(ValueError):
    """Invalid search envelope or predicate tree (maps to HTTP 400)."""


class SortSpec(BaseModel):
    """One sort key in caller order."""

    model_config = ConfigDict(extra="forbid")

    attribute: str
    direction: str


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
    sort: list[SortSpec] | None = None,
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

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(count_query, params)
        count_row = cur.fetchone()
        assert count_row is not None
        total = int(count_row["count"])
        cur.execute(select_query, [*params, resolved_limit, resolved_offset])
        rows = cur.fetchall()

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
        raise SearchValidationError("limit must be an integer")
    if limit < 1 or limit > MAX_SEARCH_LIMIT:
        raise SearchValidationError(
            f"limit must be between 1 and {MAX_SEARCH_LIMIT} (got {limit})"
        )
    return limit


def _resolve_offset(offset: int | None) -> int:
    if offset is None:
        return 0
    if not isinstance(offset, int) or isinstance(offset, bool):
        raise SearchValidationError("offset must be an integer")
    if offset < 0:
        raise SearchValidationError(f"offset must be non-negative (got {offset})")
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
            raise SearchValidationError(f"unknown attribute: {name!r}")
        if name in seen:
            continue
        seen.add(name)
        columns.append(name)
    return columns


def _resolve_sort(
    sort: list[SortSpec] | None,
    attrs: dict[str, SearchableAttribute],
) -> list[tuple[str, str]]:
    order: list[tuple[str, str]] = []
    seen: set[str] = set()
    for spec in sort or []:
        if spec.attribute not in attrs:
            raise SearchValidationError(f"unknown sort attribute: {spec.attribute!r}")
        direction = spec.direction.lower()
        if direction not in {"asc", "desc"}:
            raise SearchValidationError(
                f"sort direction must be 'asc' or 'desc' (got {spec.direction!r})"
            )
        order.append((spec.attribute, direction))
        seen.add(spec.attribute)
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
        raise SearchValidationError("predicate must be an object or null")
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
        raise SearchValidationError(
            f"predicate nesting depth exceeds maximum of {MAX_SEARCH_NESTING_DEPTH}"
        )
    if not isinstance(node, dict):
        raise SearchValidationError("each predicate node must be an object")
    if "op" not in node:
        raise SearchValidationError("predicate node requires 'op'")
    op = node["op"]
    if not isinstance(op, str):
        raise SearchValidationError("predicate 'op' must be a string")
    if op in DEFERRED_OPS:
        raise SearchValidationError(
            f"operator {op!r} is not implemented yet (reserved for a later slice)"
        )
    if op not in SLICE_A_OPS:
        raise SearchValidationError(f"unknown operator: {op!r}")

    if op in {"and", "or"}:
        return _compile_logical_list(op, node, attrs, depth=depth, params=params)
    if op == "not":
        return _compile_not(node, attrs, depth=depth, params=params)
    if op in _VALUE_OPS:
        return _compile_comparison(op, node, attrs, params=params)
    return _compile_null_check(op, node, attrs)


def _unexpected_keys(node: dict[str, Any], allowed: set[str]) -> None:
    extra = set(node) - allowed
    if extra:
        raise SearchValidationError(
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
    if not isinstance(children, list) or len(children) == 0:
        raise SearchValidationError(
            f"{op!r} requires a non-empty 'predicates' array"
        )
    if len(children) > MAX_SEARCH_NESTING_LENGTH:
        raise SearchValidationError(
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
        raise SearchValidationError("'not' requires a 'predicate' child")
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
        raise SearchValidationError(f"{op!r} requires 'value'")
    raw = node["value"]
    if raw is None:
        raise SearchValidationError(
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


def _require_attribute(
    node: dict[str, Any],
    attrs: dict[str, SearchableAttribute],
) -> SearchableAttribute:
    name = node.get("attribute")
    if not isinstance(name, str) or not name:
        raise SearchValidationError("comparison predicate requires string 'attribute'")
    try:
        return attrs[name]
    except KeyError as exc:
        raise SearchValidationError(f"unknown attribute: {name!r}") from exc


def _coerce_value(attr: SearchableAttribute, raw: Any) -> Any:
    adapter = _TYPE_ADAPTERS.get(attr.type_name)
    if adapter is None:
        raise SearchValidationError(
            f"unsupported attribute type for search: {attr.type_name!r}"
        )
    try:
        value = adapter.validate_python(raw)
    except ValidationError as exc:
        raise SearchValidationError(
            f"value for attribute {attr.name!r} ({attr.type_name}) is invalid: {exc}"
        ) from exc
    if attr.type_name == "datetime":
        if value.tzinfo is None:
            raise SearchValidationError(
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
