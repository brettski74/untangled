"""Small M1 type vocabulary for class definition attributes."""

from __future__ import annotations

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

# YAML types that map to the same PostgreSQL ``text`` column type. Intra-family
# renames must not emit migrate DDL (see ``YAML_TO_POSTGRES`` / schema diff).
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

# Human-oriented notes for docs and errors.
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

DEFAULT_FRIENDLY_ID_PAD_WIDTH = 8
MIN_FRIENDLY_ID_PAD_WIDTH = 4


def friendly_id_sequence_name(prefix: str) -> str:
    """Deterministic sequence name for a friendly-id prefix."""
    return f"friendly_id_{prefix.lower()}"


def format_friendly_id(prefix: str, value: int, pad_width: int) -> str:
    """Format ``prefix`` + zero-padded ``value``; overflow keeps full digits."""
    body = str(value)
    if len(body) < pad_width:
        body = body.zfill(pad_width)
    return f"{prefix}{body}"
