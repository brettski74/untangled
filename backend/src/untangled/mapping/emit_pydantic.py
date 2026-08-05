"""Emit Pydantic model modules from class definitions."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from untangled.mapping.definition import AttributeDefinition, ClassDefinition
from untangled.mapping.naming import snake_to_pascal
from untangled.mapping.system_fields import SYSTEM_FIELDS
from untangled.mapping.types import SUPPORTED_TYPES

_HEADER = '''\
"""Generated Pydantic models. Do not edit by hand; run `make models`."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from untangled.mapping.datetime_utc import format_utc_iso_z, require_utc_seconds

UtcDatetime = Annotated[
    AwareDatetime,
    PlainSerializer(
        format_utc_iso_z,
        return_type=str,
    ),
]


def _require_utc(value: datetime) -> datetime:
    return require_utc_seconds(value)

'''

_PYDANTIC_TYPE: dict[str, str] = {
    "string": "str",
    "compact-text": "str",
    "choice": "str",
    "status": "str",
    "text": "str",
    "multiline-text": "str",
    "boolean": "bool",
    "integer": "int",
    "float": "float",
    "decimal": "Decimal",
    "uuid": "UUID",
    "datetime": "UtcDatetime",
    "friendly-id": "str",
}

assert set(_PYDANTIC_TYPE) == SUPPORTED_TYPES


def emit_pydantic_module(definition: ClassDefinition) -> str:
    """Return Python source for one class's Pydantic module (full + create + update)."""
    class_name = snake_to_pascal(definition.name_snake)
    writable = [a for a in definition.attributes if a.type_name != "friendly-id"]
    lines: list[str] = [_HEADER]

    lines.extend(_emit_full_model(definition, class_name))
    lines.append("")
    lines.extend(_emit_write_model(definition, class_name, writable, variant="Create"))
    lines.append("")
    lines.extend(_emit_write_model(definition, class_name, writable, variant="Update"))
    lines.append("")
    return "\n".join(lines)


def _emit_full_model(definition: ClassDefinition, class_name: str) -> list[str]:
    lines: list[str] = [f"class {class_name}(BaseModel):"]
    lines.extend(_python_class_docstring(definition))
    lines.append("")
    lines.append("    model_config = ConfigDict(extra='forbid')")
    lines.append("")

    for field in SYSTEM_FIELDS:
        py_type = _PYDANTIC_TYPE[field.type_name]
        lines.append(f"    {field.name}: {py_type}  # {field.description}")

    for attr in definition.attributes:
        lines.append(f"    {_field_line(attr, constrained=False)}")

    lines.extend(_datetime_validator(definition, include_system=True))
    return lines


def _emit_write_model(
    definition: ClassDefinition,
    class_name: str,
    writable: list[AttributeDefinition],
    *,
    variant: str,
) -> list[str]:
    """Create (required as YAML) or Update (all optional) writable-field models."""
    name = f"{class_name}{variant}"
    lines: list[str] = [
        f"class {name}(BaseModel):",
        f'    """Writable fields for {definition.display_name} {variant.lower()}."""',
        "",
        "    model_config = ConfigDict(extra='forbid')",
        "",
    ]
    if not writable:
        lines.append("    pass")
        return lines

    for attr in writable:
        if variant == "Update":
            lines.append(f"    {_field_line(attr, optional=True)}")
        else:
            lines.append(f"    {_field_line(attr)}")

    datetime_attrs = [a for a in writable if a.type_name == "datetime"]
    if datetime_attrs:
        lines.append("")
        names = ", ".join(repr(a.name_snake) for a in datetime_attrs)
        lines.append(f"    @field_validator({names}, mode='after')")
        lines.append("    @classmethod")
        lines.append(
            "    def _utc_datetimes(cls, value: datetime | None) -> datetime | None:"
        )
        lines.append("        if value is None:")
        lines.append("            return None")
        lines.append("        return _require_utc(value)")
    return lines


def _datetime_validator(definition: ClassDefinition, *, include_system: bool) -> list[str]:
    datetime_fields = (
        [f.name for f in SYSTEM_FIELDS if f.type_name == "datetime"] if include_system else []
    ) + [a.name_snake for a in definition.attributes if a.type_name == "datetime"]
    if not datetime_fields:
        return []
    lines: list[str] = [""]
    names = ", ".join(repr(n) for n in datetime_fields)
    lines.append(f"    @field_validator({names}, mode='after')")
    lines.append("    @classmethod")
    lines.append("    def _utc_datetimes(cls, value: datetime | None) -> datetime | None:")
    lines.append("        if value is None:")
    lines.append("            return None")
    lines.append("        return _require_utc(value)")
    return lines


def _field_constraints(attr: AttributeDefinition) -> str:
    parts: list[str] = []
    if attr.min_value is not None:
        parts.append(f"ge={_literal(attr.min_value)}")
    if attr.max_value is not None:
        parts.append(f"le={_literal(attr.max_value)}")
    return ", ".join(parts)


def _literal(value: object) -> str:
    if isinstance(value, Decimal):
        return f'Decimal("{format(value, "f")}")'
    return repr(value)


def _field_line(
    attr: AttributeDefinition,
    *,
    optional: bool = False,
    constrained: bool = True,
) -> str:
    py_type = _PYDANTIC_TYPE[attr.type_name]
    constraints = _field_constraints(attr) if constrained else ""
    if optional or not attr.required:
        if constraints:
            return (
                f"{attr.name_snake}: {py_type} | None = Field(default=None, {constraints})"
            )
        return f"{attr.name_snake}: {py_type} | None = None"
    if constraints:
        return f"{attr.name_snake}: {py_type} = Field({constraints})"
    return f"{attr.name_snake}: {py_type}"


def _python_class_docstring(definition: ClassDefinition) -> list[str]:
    """Emit an indented triple-quoted docstring from display-name + description."""
    body = f"{definition.display_name}\n\n{definition.description}"
    safe = body.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')
    return [f'    """{safe}"""']


def write_pydantic_models(definitions: list[ClassDefinition], output_dir: Path) -> list[Path]:
    """Write one module per class plus ``__init__.py``. Returns written paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    exports: list[tuple[str, list[str]]] = []

    for definition in definitions:
        module_stem = definition.name_snake
        class_name = snake_to_pascal(definition.name_snake)
        path = output_dir / f"{module_stem}.py"
        path.write_text(emit_pydantic_module(definition), encoding="utf-8")
        written.append(path)
        exports.append(
            (
                module_stem,
                [class_name, f"{class_name}Create", f"{class_name}Update"],
            )
        )

    init_lines = [
        '"""Generated Pydantic models. Do not edit by hand; run `make models`."""',
        "",
    ]
    all_names: list[str] = []
    for module_stem, names in exports:
        init_lines.append(f"from .{module_stem} import {', '.join(names)}")
        all_names.extend(names)
    init_lines.append("")
    init_lines.append("__all__ = [")
    for name in all_names:
        init_lines.append(f'    "{name}",')
    init_lines.append("]")
    init_lines.append("")

    init_path = output_dir / "__init__.py"
    init_path.write_text("\n".join(init_lines), encoding="utf-8")
    written.append(init_path)
    return written
