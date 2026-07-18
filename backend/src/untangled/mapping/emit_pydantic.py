"""Emit Pydantic model modules from class definitions."""

from __future__ import annotations

from pathlib import Path

from untangled.mapping.definition import AttributeDefinition, ClassDefinition
from untangled.mapping.naming import snake_to_pascal
from untangled.mapping.system_fields import SYSTEM_FIELDS

_HEADER = '''\
"""Generated Pydantic models. Do not edit by hand; run `make models`."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, PlainSerializer, field_validator

UtcDatetime = Annotated[
    AwareDatetime,
    PlainSerializer(
        lambda value: value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        return_type=str,
    ),
]


def _require_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("datetime must be timezone-aware (UTC)")
    return value.astimezone(timezone.utc)

'''

_PYDANTIC_TYPE: dict[str, str] = {
    "string": "str",
    "boolean": "bool",
    "integer": "int",
    "float": "float",
    "decimal": "Decimal",
    "uuid": "UUID",
    "datetime": "UtcDatetime",
}


def emit_pydantic_module(definition: ClassDefinition) -> str:
    """Return Python source for one class's Pydantic module."""
    class_name = snake_to_pascal(definition.name_snake)
    lines: list[str] = [_HEADER, f"class {class_name}(BaseModel):"]
    lines.extend(_python_class_docstring(definition))
    lines.append("")
    lines.append("    model_config = ConfigDict(extra='forbid')")
    lines.append("")

    for field in SYSTEM_FIELDS:
        py_type = _PYDANTIC_TYPE[field.type_name]
        lines.append(f"    {field.name}: {py_type}  # {field.description}")

    for attr in definition.attributes:
        lines.append(f"    {_field_line(attr)}")

    datetime_fields = [
        f.name for f in SYSTEM_FIELDS if f.type_name == "datetime"
    ] + [a.name_snake for a in definition.attributes if a.type_name == "datetime"]
    if datetime_fields:
        lines.append("")
        names = ", ".join(repr(n) for n in datetime_fields)
        lines.append(f"    @field_validator({names}, mode='after')")
        lines.append("    @classmethod")
        lines.append(
            "    def _utc_datetimes(cls, value: datetime | None) -> datetime | None:"
        )
        lines.append("        if value is None:")
        lines.append("            return None")
        lines.append("        return _require_utc(value)")

    lines.append("")
    return "\n".join(lines)


def _field_line(attr: AttributeDefinition) -> str:
    py_type = _PYDANTIC_TYPE[attr.type_name]
    if attr.required:
        return f"{attr.name_snake}: {py_type}"
    return f"{attr.name_snake}: {py_type} | None = None"


def _python_class_docstring(definition: ClassDefinition) -> list[str]:
    """Emit an indented triple-quoted docstring from display-name + description."""
    body = f"{definition.display_name}\n\n{definition.description}"
    safe = body.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')
    return [f'    """{safe}"""']


def write_pydantic_models(definitions: list[ClassDefinition], output_dir: Path) -> list[Path]:
    """Write one module per class plus ``__init__.py``. Returns written paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    exports: list[tuple[str, str]] = []

    for definition in definitions:
        module_stem = definition.name_snake
        class_name = snake_to_pascal(definition.name_snake)
        path = output_dir / f"{module_stem}.py"
        path.write_text(emit_pydantic_module(definition), encoding="utf-8")
        written.append(path)
        exports.append((module_stem, class_name))

    init_lines = [
        '"""Generated Pydantic models. Do not edit by hand; run `make models`."""',
        "",
    ]
    for module_stem, class_name in exports:
        init_lines.append(f"from .{module_stem} import {class_name}")
    init_lines.append("")
    init_lines.append("__all__ = [")
    for _, class_name in exports:
        init_lines.append(f'    "{class_name}",')
    init_lines.append("]")
    init_lines.append("")

    init_path = output_dir / "__init__.py"
    init_path.write_text("\n".join(init_lines), encoding="utf-8")
    written.append(init_path)
    return written
