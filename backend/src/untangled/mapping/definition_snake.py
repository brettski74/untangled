"""Load and validate snake_case YAML class definitions (dark path; #187).

Not wired as the production entrypoint — see ``definition.py`` (kebab) for that.
Primary identity on this path is snake; ``name_kebab`` on the shared IR is
synthetic scaffolding via ``snake_to_kebab`` until dual identity is collapsed.
"""

from __future__ import annotations

import warnings
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID

import yaml

from untangled.mapping.definition import (
    AttributeDefinition,
    ClassDefinition,
    DefinitionError,
    DeprecatedStringTypeWarning,
    validate_platform_definitions,
)
from untangled.mapping.naming import is_snake_case, snake_to_kebab
from untangled.mapping.system_fields import SYSTEM_FIELD_NAMES
from untangled.mapping.types_snake import (
    DEFAULT_FRIENDLY_ID_PAD_WIDTH,
    MIN_FRIENDLY_ID_PAD_WIDTH,
    SUPPORTED_TYPES,
    TEXT_STORAGE_FAMILY,
)
from untangled.mapping.well_known_snake import SubstitutionError, substitute

# Make ``string`` deprecations visible for this loader module.
warnings.filterwarnings(
    "default",
    category=DeprecatedStringTypeWarning,
    module=r"untangled\.mapping\.definition_snake",
)

__all__ = [
    "AttributeDefinition",
    "ClassDefinition",
    "DefinitionError",
    "DeprecatedStringTypeWarning",
    "load_definition",
    "load_definitions",
    "validate_platform_definitions",
]


def load_definitions(definitions_dir: Path) -> list[ClassDefinition]:
    """Load every ``*.yaml`` / ``*.yml`` snake-dialect class definition."""
    if not definitions_dir.is_dir():
        raise DefinitionError(f"definitions directory does not exist: {definitions_dir}")

    paths = sorted(
        (
            *definitions_dir.glob("*.yaml"),
            *definitions_dir.glob("*.yml"),
        ),
        key=lambda p: p.name,
    )
    if not paths:
        raise DefinitionError(f"no YAML class definitions found in {definitions_dir}")

    definitions = [load_definition(path) for path in paths]
    _validate_references(definitions)
    _validate_friendly_id_prefixes(definitions)
    return definitions


def load_definition(path: Path) -> ClassDefinition:
    """Load and validate a single snake_case class definition YAML file."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise DefinitionError(f"{path}: invalid YAML: {exc}") from exc

    if not isinstance(raw, dict):
        raise DefinitionError(f"{path}: root must be a mapping")

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise DefinitionError(f"{path}: 'name' is required (snake_case class name)")
    name = name.strip()
    _require_snake(name, path, "name")

    display_name = raw.get("display_name")
    if not isinstance(display_name, str) or not display_name.strip():
        raise DefinitionError(f"{path}: 'display_name' is required")
    display_name = display_name.strip()

    description = raw.get("description")
    if not isinstance(description, str) or not description.strip():
        raise DefinitionError(f"{path}: 'description' is required")
    description = description.strip()

    attributes_raw = raw.get("attributes", {})
    if attributes_raw is None:
        attributes_raw = {}
    if not isinstance(attributes_raw, dict):
        raise DefinitionError(f"{path}: 'attributes' must be a mapping")

    attributes: list[AttributeDefinition] = []
    seen_snake: set[str] = set()
    friendly_id_count = 0
    for attr_snake, spec in attributes_raw.items():
        if not isinstance(attr_snake, str):
            raise DefinitionError(f"{path}: attribute keys must be strings")
        _require_snake(attr_snake, path, f"attribute '{attr_snake}'")
        if attr_snake in SYSTEM_FIELD_NAMES:
            raise DefinitionError(
                f"{path}: attribute '{attr_snake}' conflicts with injected system "
                f"field '{attr_snake}'; remove it from the YAML definition"
            )
        if attr_snake in seen_snake:
            raise DefinitionError(f"{path}: duplicate attribute '{attr_snake}'")
        seen_snake.add(attr_snake)

        if not isinstance(spec, dict):
            raise DefinitionError(f"{path}: attribute '{attr_snake}' must be a mapping")

        type_name = spec.get("type")
        if not isinstance(type_name, str) or type_name not in SUPPORTED_TYPES:
            raise DefinitionError(
                f"{path}: attribute '{attr_snake}' has unsupported type "
                f"{type_name!r}; expected one of {sorted(SUPPORTED_TYPES)}"
            )
        if type_name == "string":
            warnings.warn(
                f"{path}: attribute '{attr_snake}' uses deprecated type "
                f"'string'; prefer 'compact_text' (behaviour is identical)",
                DeprecatedStringTypeWarning,
                stacklevel=2,
            )

        required = spec.get("required", False)
        if not isinstance(required, bool):
            raise DefinitionError(
                f"{path}: attribute '{attr_snake}'.required must be a boolean"
            )

        references_raw = spec.get("references")
        references: str | None = None
        if references_raw is not None:
            if not isinstance(references_raw, str) or not references_raw.strip():
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}'.references must be a "
                    f"non-empty string"
                )
            references = references_raw.strip()
            _require_snake(references, path, f"attribute '{attr_snake}'.references")
            if type_name != "uuid":
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}' with references must have "
                    f"type uuid"
                )

        unique = spec.get("unique", False)
        if not isinstance(unique, bool):
            raise DefinitionError(
                f"{path}: attribute '{attr_snake}'.unique must be a boolean"
            )

        create_default: str | int | float | bool | None = None
        if "create_default" in spec:
            create_default = _parse_create_default(
                path, attr_snake, type_name, spec.get("create_default")
            )

        min_value: int | float | Decimal | None = None
        max_value: int | float | Decimal | None = None
        if "min_value" in spec or "max_value" in spec:
            min_value, max_value = _parse_min_max(path, attr_snake, type_name, spec)

        prefix: str | None = None
        pad_width = DEFAULT_FRIENDLY_ID_PAD_WIDTH
        start_at: int | None = None

        if type_name == "friendly_id":
            friendly_id_count += 1
            if friendly_id_count > 1:
                raise DefinitionError(
                    f"{path}: at most one friendly_id attribute is allowed per class"
                )
            if references is not None:
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}' friendly_id cannot have "
                    f"references"
                )
            if create_default is not None:
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}' friendly_id cannot have "
                    f"create_default"
                )
            prefix_raw = spec.get("prefix")
            if not isinstance(prefix_raw, str) or not prefix_raw.strip():
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}'.prefix is required for "
                    f"friendly_id"
                )
            prefix = prefix_raw.strip()
            if not prefix.isalnum():
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}'.prefix must be alphanumeric, "
                    f"got {prefix!r}"
                )

            if "pad_width" in spec:
                pad_raw = spec.get("pad_width")
                if not isinstance(pad_raw, int) or isinstance(pad_raw, bool):
                    raise DefinitionError(
                        f"{path}: attribute '{attr_snake}'.pad_width must be an "
                        f"integer"
                    )
                if pad_raw < MIN_FRIENDLY_ID_PAD_WIDTH:
                    raise DefinitionError(
                        f"{path}: attribute '{attr_snake}'.pad_width must be >= "
                        f"{MIN_FRIENDLY_ID_PAD_WIDTH}, got {pad_raw}"
                    )
                pad_width = pad_raw

            if "start_at" in spec:
                start_raw = spec.get("start_at")
                if not isinstance(start_raw, int) or isinstance(start_raw, bool):
                    raise DefinitionError(
                        f"{path}: attribute '{attr_snake}'.start_at must be an "
                        f"integer"
                    )
                if start_raw < 1:
                    raise DefinitionError(
                        f"{path}: attribute '{attr_snake}'.start_at must be >= 1, "
                        f"got {start_raw}"
                    )
                start_at = start_raw

            unique = True
            allowed = {"type", "required", "prefix", "pad_width", "start_at", "unique"}
        else:
            if "prefix" in spec or "pad_width" in spec or "start_at" in spec:
                raise DefinitionError(
                    f"{path}: attribute '{attr_snake}' has friendly_id-only keys "
                    f"(prefix/pad_width/start_at) but type is {type_name!r}"
                )
            allowed = {
                "type",
                "required",
                "references",
                "unique",
                "create_default",
                "min_value",
                "max_value",
            }

        unknown = set(spec) - allowed
        if unknown:
            raise DefinitionError(
                f"{path}: attribute '{attr_snake}' has unknown keys: {sorted(unknown)}"
            )

        attributes.append(
            AttributeDefinition(
                name_kebab=snake_to_kebab(attr_snake),
                name_snake=attr_snake,
                type_name=type_name,
                required=required,
                references=references,
                unique=unique,
                create_default=create_default,
                min_value=min_value,
                max_value=max_value,
                prefix=prefix,
                pad_width=pad_width,
                start_at=start_at,
            )
        )

    unknown_top = set(raw) - {
        "name",
        "display_name",
        "description",
        "attributes",
        "display_attribute",
        "public",
        "suppress_create",
        "suppress_delete",
        "suppress_search",
        "check_constraint",
    }
    if unknown_top:
        raise DefinitionError(f"{path}: unknown top-level keys: {sorted(unknown_top)}")

    display_attribute = _resolve_display_attribute(
        path, name, attributes, raw.get("display_attribute", _DISPLAY_ATTRIBUTE_OMITTED)
    )
    public = _parse_optional_bool(path, "public", raw)
    suppress_create = _parse_optional_bool(path, "suppress_create", raw)
    suppress_delete = _parse_optional_bool(path, "suppress_delete", raw)
    suppress_search = _parse_optional_bool(path, "suppress_search", raw)
    check_constraints = _parse_check_constraints(path, raw)

    return ClassDefinition(
        name_kebab=snake_to_kebab(name),
        name_snake=name,
        display_name=display_name,
        description=description,
        attributes=tuple(attributes),
        source_path=path,
        display_attribute=display_attribute,
        public=public,
        suppress_create=suppress_create,
        suppress_delete=suppress_delete,
        suppress_search=suppress_search,
        check_constraints=check_constraints,
    )


_DISPLAY_ATTRIBUTE_OMITTED = object()


def _resolve_display_attribute(
    path: Path,
    class_name: str,
    attributes: list[AttributeDefinition],
    raw: object,
) -> AttributeDefinition | None:
    by_snake = {attr.name_snake: attr for attr in attributes}

    if raw is _DISPLAY_ATTRIBUTE_OMITTED:
        default = by_snake.get("display_name")
        if default is not None and default.type_name == "compact_text":
            return default
        return None

    if raw is None:
        return None

    if not isinstance(raw, str) or not raw.strip():
        raise DefinitionError(
            f"{path}: class {class_name!r}: display_attribute must be a non-empty "
            f"snake_case attribute name or null, got {raw!r}"
        )
    value = raw.strip()
    try:
        _require_snake(value, path, "display_attribute")
    except DefinitionError as exc:
        raise DefinitionError(
            f"{path}: class {class_name!r}: display_attribute {value!r} is not "
            f"snake_case"
        ) from exc

    attr = by_snake.get(value)
    if attr is None:
        raise DefinitionError(
            f"{path}: class {class_name!r}: display_attribute {value!r} does not "
            f"name a declared attribute"
        )
    if attr.type_name != "compact_text":
        raise DefinitionError(
            f"{path}: class {class_name!r}: display_attribute {value!r} must have "
            f"type exactly 'compact_text', got {attr.type_name!r}"
        )
    return attr


def _validate_references(definitions: list[ClassDefinition]) -> None:
    known = {defn.name_snake for defn in definitions}
    for defn in definitions:
        for attr in defn.attributes:
            if attr.references is None:
                continue
            if attr.references not in known:
                raise DefinitionError(
                    f"{defn.source_path}: attribute '{attr.name_snake}' references "
                    f"unknown class {attr.references!r}"
                )


def _validate_friendly_id_prefixes(definitions: list[ClassDefinition]) -> None:
    seen: dict[str, tuple[Path, str]] = {}
    for defn in definitions:
        for attr in defn.attributes:
            if attr.type_name != "friendly_id" or attr.prefix is None:
                continue
            key = attr.prefix.lower()
            if key in seen:
                other_path, other_prefix = seen[key]
                raise DefinitionError(
                    f"{defn.source_path}: friendly_id prefix {attr.prefix!r} collides "
                    f"with {other_prefix!r} in {other_path} (prefixes are "
                    f"case-insensitive)"
                )
            seen[key] = (defn.source_path, attr.prefix)


def _parse_optional_bool(path: Path, key: str, raw: dict[object, object]) -> bool:
    if key not in raw:
        return False
    value = raw[key]
    if not isinstance(value, bool):
        raise DefinitionError(f"{path}: '{key}' must be a boolean")
    return value


def _parse_check_constraints(path: Path, raw: dict[object, object]) -> tuple[str, ...]:
    if "check_constraint" not in raw:
        return ()
    value = raw["check_constraint"]
    expressions: list[str]
    if isinstance(value, str):
        expressions = [value]
    elif isinstance(value, list):
        expressions = list(value)
    else:
        raise DefinitionError(
            f"{path}: 'check_constraint' must be a string or a list of strings"
        )
    if not expressions:
        raise DefinitionError(f"{path}: 'check_constraint' must not be empty")
    resolved: list[str] = []
    for index, expr in enumerate(expressions, start=1):
        if not isinstance(expr, str) or not expr.strip():
            raise DefinitionError(
                f"{path}: 'check_constraint' entry {index} must be a non-empty string"
            )
        try:
            resolved.append(substitute(expr.strip(), "check_constraint"))
        except SubstitutionError as exc:
            raise DefinitionError(f"{path}: {exc}") from exc
    return tuple(resolved)


_NUMERIC_BOUND_TYPES = frozenset({"integer", "float", "decimal"})


def _parse_min_max(
    path: Path,
    attr_snake: str,
    type_name: str,
    spec: dict[object, object],
) -> tuple[int | float | Decimal | None, int | float | Decimal | None]:
    if type_name not in _NUMERIC_BOUND_TYPES:
        raise DefinitionError(
            f"{path}: attribute '{attr_snake}' min_value/max_value are only valid "
            f"for integer, float, or decimal (got {type_name!r})"
        )
    min_value = (
        _parse_numeric_bound(
            path, attr_snake, type_name, "min_value", spec["min_value"]
        )
        if "min_value" in spec
        else None
    )
    max_value = (
        _parse_numeric_bound(
            path, attr_snake, type_name, "max_value", spec["max_value"]
        )
        if "max_value" in spec
        else None
    )
    if min_value is not None and max_value is not None and min_value > max_value:
        raise DefinitionError(
            f"{path}: attribute '{attr_snake}' min_value must be <= max_value"
        )
    return min_value, max_value


def _parse_numeric_bound(
    path: Path,
    attr_snake: str,
    type_name: str,
    key: str,
    raw: object,
) -> int | float | Decimal:
    label = f"{path}: attribute '{attr_snake}'.{key}"
    if raw is None:
        raise DefinitionError(f"{label} must not be null; omit the key instead")
    if type_name == "integer":
        if not isinstance(raw, int) or isinstance(raw, bool):
            raise DefinitionError(f"{label} must be an integer")
        return raw
    if type_name == "float":
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise DefinitionError(f"{label} must be a number")
        return float(raw)
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        raise DefinitionError(f"{label} must be a decimal string or number")
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise DefinitionError(f"{label} is not a valid decimal") from exc


def _parse_create_default(
    path: Path,
    attr_snake: str,
    type_name: str,
    raw: object,
) -> str | int | float | bool:
    label = f"{path}: attribute '{attr_snake}'.create_default"
    if raw is None:
        raise DefinitionError(
            f"{label} must not be null; omit the key when there is no default"
        )
    if type_name in TEXT_STORAGE_FAMILY:
        if not isinstance(raw, str):
            raise DefinitionError(f"{label} must be a string for type {type_name!r}")
        return raw
    if type_name == "boolean":
        if not isinstance(raw, bool):
            raise DefinitionError(f"{label} must be a boolean")
        return raw
    if type_name == "integer":
        if not isinstance(raw, int) or isinstance(raw, bool):
            raise DefinitionError(f"{label} must be an integer")
        return raw
    if type_name == "float":
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise DefinitionError(f"{label} must be a number")
        return float(raw)
    if type_name == "decimal":
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
            raise DefinitionError(f"{label} must be a decimal string or number")
        try:
            return format(Decimal(str(raw)), "f")
        except (InvalidOperation, ValueError) as exc:
            raise DefinitionError(f"{label} is not a valid decimal") from exc
    if type_name == "uuid":
        if not isinstance(raw, str):
            raise DefinitionError(f"{label} must be a UUID string")
        try:
            return str(UUID(raw))
        except ValueError as exc:
            raise DefinitionError(f"{label} is not a valid UUID") from exc
    if type_name == "datetime":
        if not isinstance(raw, str) or not raw.strip():
            raise DefinitionError(
                f"{label} must be a non-empty ISO-8601 datetime string"
            )
        return raw.strip()
    raise DefinitionError(f"{label} is not supported for type {type_name!r}")


def _require_snake(value: str, path: Path, label: str) -> None:
    if not is_snake_case(value):
        raise DefinitionError(f"{path}: {label} must be snake_case, got {value!r}")
