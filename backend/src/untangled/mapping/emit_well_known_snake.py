"""Emit generated well-known constants from the snake substitution catalog."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from untangled.mapping.well_known_snake import (
    SUBSTITUTION_CONTEXTS,
    WELL_KNOWN,
    constant_name,
)

_PY_HEADER = '''\
"""Generated well-known constants (snake dialect). Do not edit by hand."""

from uuid import UUID

'''

_TS_HEADER = """\
/**
 * Generated well-known constants and substitution catalog (snake dialect).
 * Do not edit by hand; run snake generate.
 */

"""


def emit_python_well_known() -> str:
    """Return Python source for snake catalog constants."""
    lines = [_PY_HEADER.rstrip(), ""]
    for name in sorted(WELL_KNOWN):
        value = WELL_KNOWN[name]
        const = constant_name(name)
        try:
            uuid_val = str(UUID(value))
        except ValueError:
            lines.append(f"{const} = {json.dumps(value)}")
        else:
            lines.append(f'{const} = UUID("{uuid_val}")')
    lines.append("")
    return "\n".join(lines)


def emit_ts_well_known() -> str:
    """Return TypeScript source for snake catalog constants, map, and contexts."""
    lines = [_TS_HEADER.rstrip(), ""]
    for name in sorted(WELL_KNOWN):
        value = WELL_KNOWN[name]
        const = constant_name(name)
        lines.append(f"export const {const} = {json.dumps(value)};")
    lines.append("")
    lines.append(
        "export const WELL_KNOWN: Readonly<Record<string, string>> = {"
    )
    for name in sorted(WELL_KNOWN):
        const = constant_name(name)
        lines.append(f"  {json.dumps(name)}: {const},")
    lines.append("};")
    lines.append("")
    lines.append(
        "export const SUBSTITUTION_CONTEXTS: "
        "Readonly<Record<string, readonly string[]>> = {"
    )
    for context in sorted(SUBSTITUTION_CONTEXTS):
        names = sorted(SUBSTITUTION_CONTEXTS[context])
        names_js = ", ".join(json.dumps(n) for n in names)
        lines.append(f"  {json.dumps(context)}: [{names_js}],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def write_python_well_known(output_dir: Path) -> Path:
    """Write ``well_known.py`` under ``output_dir``."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "well_known.py"
    path.write_text(emit_python_well_known(), encoding="utf-8")
    return path


def write_ts_well_known(output_dir: Path) -> Path:
    """Write ``well_known.ts`` under ``output_dir``."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "well_known.ts"
    path.write_text(emit_ts_well_known(), encoding="utf-8")
    return path
