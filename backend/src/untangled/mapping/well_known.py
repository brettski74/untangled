"""Well-known named values and context-dependent ``${…}`` substitution.

The catalog is the substitution source of truth for static UUID literals.
Clock tokens (``now``, ``tomorrow``) are evaluation-environment values, not
catalog constants — callers pass them via ``env``.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from uuid import UUID

from untangled.mapping.datetime_utc import format_utc_iso_z, require_utc_seconds

SYSTEM_CONFIG_ID = UUID("01900000-0000-7000-8000-000000000050")
SYSTEM_USER_ID = UUID("01900000-0000-7000-8000-000000000006")

CLOCK_TOKEN_NOW = "now"
CLOCK_TOKEN_TOMORROW = "tomorrow"
CLOCK_TOKEN_NAMES = frozenset({CLOCK_TOKEN_NOW, CLOCK_TOKEN_TOMORROW})
SECONDS_PER_DAY = 86400

# snake_case name → substituted literal (string form).
WELL_KNOWN: dict[str, str] = {
    "system_config_id": str(SYSTEM_CONFIG_ID),
    "system_user_id": str(SYSTEM_USER_ID),
}

# Context → names available in that context. Timing is documented with each
# consumer (check_constraint: definition load; nav_bar: nav definition load;
# create_default / data_load: evaluation-time clock env).
SUBSTITUTION_CONTEXTS: dict[str, frozenset[str]] = {
    "check_constraint": frozenset({"system_config_id"}),
    "nav_bar": frozenset({"system_config_id"}),
    "create_default": CLOCK_TOKEN_NAMES,
    "data_load": CLOCK_TOKEN_NAMES,
}

_TOKEN_RE = re.compile(r"\$\{([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\}")


class SubstitutionError(ValueError):
    """Unknown name, unknown context, or wrong-context ``${…}`` use."""


def constant_name(name_snake: str) -> str:
    """Map a catalog snake name to a Python/TS constant identifier."""
    return name_snake.upper()


def clock_env(now: datetime) -> dict[str, str]:
    """Stable ``now`` / ``tomorrow`` literals for one evaluation run.

    ``tomorrow`` is ``now + 86400`` seconds. Both are whole-second UTC ISO-8601
    with a ``Z`` suffix — ordinary datetime strings, not SQL ``now()``.
    """
    stamped = require_utc_seconds(now)
    tomorrow = stamped + timedelta(seconds=SECONDS_PER_DAY)
    return {
        CLOCK_TOKEN_NOW: format_utc_iso_z(stamped),
        CLOCK_TOKEN_TOMORROW: format_utc_iso_z(tomorrow),
    }


def substitute(
    text: str,
    context: str,
    *,
    available: frozenset[str] | None = None,
    env: dict[str, str] | None = None,
) -> str:
    """Replace ``${snake_name}`` tokens for ``context``.

    ``available`` overrides the context allowlist (tests only). Production
    callers pass a registered context name. ``env`` supplies evaluation-time
    values (clock tokens); it cannot introduce names outside the allowlist.
    """
    if available is None:
        try:
            names = SUBSTITUTION_CONTEXTS[context]
        except KeyError as exc:
            raise SubstitutionError(f"unknown substitution context: {context!r}") from exc
    else:
        names = available
    catalog = {**WELL_KNOWN, **(env or {})}

    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in names:
            raise SubstitutionError(
                f"substitution '${{{name}}}' is not available in context {context!r}"
            )
        if name not in catalog:
            raise SubstitutionError(
                f"undefined substitution '${{{name}}}' in context {context!r}"
            )
        return catalog[name]

    return _TOKEN_RE.sub(repl, text)


def substitute_if_tokens(
    value: str | int | float | bool,
    context: str,
    *,
    env: dict[str, str] | None = None,
) -> str | int | float | bool:
    """Substitute ``${…}`` in string values; leave other scalars unchanged."""
    if not isinstance(value, str) or "${" not in value:
        return value
    return substitute(value, context, env=env)
