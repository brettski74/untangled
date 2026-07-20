"""Small M1 type vocabulary for class definition attributes."""

from __future__ import annotations

# YAML ``type`` values (kebab-case where multi-word; single tokens are plain).
SUPPORTED_TYPES: frozenset[str] = frozenset(
    {
        "string",
        "boolean",
        "integer",
        "float",
        "decimal",
        "uuid",
        "datetime",
        "friendly-id",
    }
)

# Human-oriented notes for docs and errors.
TYPE_DESCRIPTIONS: dict[str, str] = {
    "string": "UTF-8 text",
    "boolean": "True/false",
    "integer": "Whole number",
    "float": "Floating-point number",
    "decimal": "Fixed-point decimal (exact; JSON string boundary)",
    "uuid": "UUID (hyphenated string at JSON boundaries)",
    "datetime": "Timezone-aware timestamp; stored and exposed as UTC",
    "friendly-id": (
        "Server-assigned operational id (prefix + zero-padded sequence); "
        "PostgreSQL text; environment-local"
    ),
}

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
