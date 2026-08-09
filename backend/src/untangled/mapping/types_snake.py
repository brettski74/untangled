"""Snake_case type vocabulary for the dark snake definition loader (#187)."""

from __future__ import annotations

from untangled.mapping.types import (
    DEFAULT_FRIENDLY_ID_PAD_WIDTH,
    MIN_FRIENDLY_ID_PAD_WIDTH,
    format_friendly_id,
    friendly_id_sequence_name,
)

# YAML ``type`` values (snake_case where multi-word; single tokens are plain).
SUPPORTED_TYPES: frozenset[str] = frozenset(
    {
        "string",
        "compact_text",
        "choice",
        "status",
        "text",
        "multiline_text",
        "boolean",
        "integer",
        "float",
        "decimal",
        "uuid",
        "datetime",
        "friendly_id",
    }
)

# YAML types that map to the same PostgreSQL ``text`` column type.
TEXT_STORAGE_FAMILY: frozenset[str] = frozenset(
    {
        "string",
        "compact_text",
        "choice",
        "status",
        "text",
        "multiline_text",
    }
)

TYPE_DESCRIPTIONS: dict[str, str] = {
    "string": (
        "Deprecated alias for compact_text (UTF-8 text); prefer compact_text"
    ),
    "compact_text": "Free-form UTF-8 text (compact UI section)",
    "choice": (
        "Restricted value set later; M1 unconstrained UTF-8 text (compact UI)"
    ),
    "status": (
        "Special choice later; M1 unconstrained UTF-8 text (compact UI)"
    ),
    "text": "UTF-8 text (full-width single-line UI section)",
    "multiline_text": "UTF-8 text (full-width multiline UI section)",
    "boolean": "True/false",
    "integer": "Whole number",
    "float": "Floating-point number",
    "decimal": "Fixed-point decimal (exact; JSON string boundary)",
    "uuid": "UUID (hyphenated string at JSON boundaries)",
    "datetime": (
        "Timezone-aware timestamp; stored and exposed as UTC at whole-second "
        "precision (nearest second; no fractional seconds on the wire)"
    ),
    "friendly_id": (
        "Server-assigned operational id (prefix + zero-padded sequence); "
        "PostgreSQL text; environment-local"
    ),
}

assert TEXT_STORAGE_FAMILY <= SUPPORTED_TYPES
assert set(TYPE_DESCRIPTIONS) == SUPPORTED_TYPES

__all__ = [
    "DEFAULT_FRIENDLY_ID_PAD_WIDTH",
    "MIN_FRIENDLY_ID_PAD_WIDTH",
    "SUPPORTED_TYPES",
    "TEXT_STORAGE_FAMILY",
    "TYPE_DESCRIPTIONS",
    "format_friendly_id",
    "friendly_id_sequence_name",
]
