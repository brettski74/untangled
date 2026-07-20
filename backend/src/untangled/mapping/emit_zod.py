"""Emit Zod schema modules from class definitions."""

from __future__ import annotations

from pathlib import Path

from untangled.mapping.definition import AttributeDefinition, ClassDefinition
from untangled.mapping.naming import snake_to_pascal
from untangled.mapping.system_fields import SYSTEM_FIELDS

_HEADER = """\
/**
 * Generated Zod schemas. Do not edit by hand; run `make models`.
 */
import { z } from "zod";

/** ISO-8601 datetime string that parses as an instant (UTC-oriented at boundaries). */
const utcDateTime = z.string().datetime({ offset: true });

/** Fixed-point decimal as a decimal string (avoids binary float drift). */
const decimalString = z
  .string()
  .regex(/^-?\\d+(\\.\\d+)?$/, "must be a decimal string");

"""

_ZOD_TYPE: dict[str, str] = {
    "string": "z.string()",
    "boolean": "z.boolean()",
    "integer": "z.number().int()",
    "float": "z.number()",
    "decimal": "decimalString",
    "uuid": "z.string().uuid()",
    "datetime": "utcDateTime",
    "friendly-id": "z.string()",
}


def emit_zod_module(definition: ClassDefinition) -> str:
    """Return TypeScript source for one class's Zod module (full + create + update)."""
    pascal = snake_to_pascal(definition.name_snake)
    writable = [a for a in definition.attributes if a.type_name != "friendly-id"]
    lines: list[str] = [
        _HEADER,
        *_jsdoc_comment(definition),
        f"export const {pascal}Schema = z.object({{",
    ]

    for field in SYSTEM_FIELDS:
        lines.append(f"  {field.name}: {_ZOD_TYPE[field.type_name]},")

    for attr in definition.attributes:
        lines.append(f"  {_zod_field_line(attr)},")

    lines.append("});")
    lines.append("")
    lines.append(f"export type {pascal} = z.infer<typeof {pascal}Schema>;")
    lines.append("")

    lines.append(f"export const {pascal}CreateSchema = z.object({{")
    for attr in writable:
        lines.append(f"  {_zod_field_line(attr)},")
    lines.append("});")
    lines.append("")
    lines.append(f"export type {pascal}Create = z.infer<typeof {pascal}CreateSchema>;")
    lines.append("")

    lines.append(f"export const {pascal}UpdateSchema = z.object({{")
    for attr in writable:
        expr = _ZOD_TYPE[attr.type_name]
        lines.append(f"  {attr.name_snake}: {expr}.optional().nullable(),")
    lines.append("});")
    lines.append("")
    lines.append(f"export type {pascal}Update = z.infer<typeof {pascal}UpdateSchema>;")
    lines.append("")
    return "\n".join(lines)


def _zod_field_line(attr: AttributeDefinition) -> str:
    expr = _ZOD_TYPE[attr.type_name]
    if attr.required:
        return f"{attr.name_snake}: {expr}"
    return f"{attr.name_snake}: {expr}.optional().nullable()"


def _jsdoc_comment(definition: ClassDefinition) -> list[str]:
    """Emit a JSDoc block from display-name + description."""
    desc = definition.description.replace("*/", "*\\/")
    lines = ["/**", f" * {definition.display_name}", " *"]
    for part in desc.splitlines() or [""]:
        lines.append(f" * {part}" if part else " *")
    lines.append(" */")
    return lines


def write_zod_models(definitions: list[ClassDefinition], output_dir: Path) -> list[Path]:
    """Write one module per class plus a barrel ``index.ts``. Returns written paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    export_names: list[str] = []

    for definition in definitions:
        module_stem = definition.name_snake
        path = output_dir / f"{module_stem}.ts"
        path.write_text(emit_zod_module(definition), encoding="utf-8")
        written.append(path)
        export_names.append(module_stem)

    index_lines = [
        "/** Generated Zod schemas. Do not edit by hand; run `make models`. */",
        "",
    ]
    for module_stem in export_names:
        index_lines.append(f'export * from "./{module_stem}";')
    index_lines.append("")

    index_path = output_dir / "index.ts"
    index_path.write_text("\n".join(index_lines), encoding="utf-8")
    written.append(index_path)
    return written
