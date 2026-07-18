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
}
