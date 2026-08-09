"""Snake_case well-known ``${…}`` catalog for the live snake definition loader.
"""

from __future__ import annotations

import re
from uuid import UUID

# Same literal values as the kebab catalog; names are snake_case.
SYSTEM_CONFIG_ID = UUID("01900000-0000-7000-8000-000000000050")
SYSTEM_USER_ID = UUID("01900000-0000-7000-8000-000000000006")

WELL_KNOWN: dict[str, str] = {
    "system_config_id": str(SYSTEM_CONFIG_ID),
    "system_user_id": str(SYSTEM_USER_ID),
}

SUBSTITUTION_CONTEXTS: dict[str, frozenset[str]] = {
    "check_constraint": frozenset({"system_config_id"}),
    "nav_bar": frozenset({"system_config_id"}),
}

_TOKEN_RE = re.compile(r"\$\{([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\}")


class SubstitutionError(ValueError):
    """Unknown name, unknown context, or wrong-context ``${…}`` use."""


def constant_name(name_snake: str) -> str:
    """Map a catalog snake name to a Python/TS constant identifier."""
    return name_snake.upper()


def substitute(
    text: str,
    context: str,
    *,
    available: frozenset[str] | None = None,
) -> str:
    """Replace ``${snake_name}`` tokens for ``context``."""
    if available is None:
        try:
            names = SUBSTITUTION_CONTEXTS[context]
        except KeyError as exc:
            raise SubstitutionError(f"unknown substitution context: {context!r}") from exc
    else:
        names = available

    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in WELL_KNOWN:
            raise SubstitutionError(
                f"undefined substitution '${{{name}}}' in context {context!r}"
            )
        if name not in names:
            raise SubstitutionError(
                f"substitution '${{{name}}}' is not available in context {context!r}"
            )
        return WELL_KNOWN[name]

    return _TOKEN_RE.sub(repl, text)
