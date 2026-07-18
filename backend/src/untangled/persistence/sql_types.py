"""Map class-definition YAML types to PostgreSQL column types."""

from __future__ import annotations

from untangled.mapping.types import SUPPORTED_TYPES

# Keep in lockstep with docs/class-definitions.md type vocabulary.
YAML_TO_POSTGRES: dict[str, str] = {
    "string": "text",
    "boolean": "boolean",
    "integer": "integer",
    "float": "double precision",
    "decimal": "numeric",
    "uuid": "uuid",
    "datetime": "timestamptz",
}

assert set(YAML_TO_POSTGRES) == SUPPORTED_TYPES


def postgres_type(type_name: str) -> str:
    """Return the PostgreSQL type for a supported YAML ``type`` value."""
    try:
        return YAML_TO_POSTGRES[type_name]
    except KeyError as exc:
        raise ValueError(f"unsupported attribute type: {type_name!r}") from exc
