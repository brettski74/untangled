"""Emit TypeScript class field metadata from Schema IR (YAML order)."""

from __future__ import annotations

import json
from pathlib import Path

from untangled.mapping.definition import AttributeDefinition, ClassDefinition

_HEADER = """\
/**
 * Generated class field metadata. Do not edit by hand; run `make models`.
 * Attribute arrays follow YAML declaration order. Each attribute carries an
 * explicit 0-based ``order`` ordinal (declaration order). Consumers must sort
 * by ``order`` and fail closed if it is missing — do not invent a sort.
 */
"""


def emit_field_meta_module(definitions: list[ClassDefinition]) -> str:
    """Return TypeScript source for all classes' field metadata."""
    lines: list[str] = [
        _HEADER,
        "export type AttributeFieldMeta = {",
        "  name_kebab: string;",
        "  name_snake: string;",
        "  type_name: string;",
        "  required: boolean;",
        "  references: string | null;",
        "  /** Declaration-order ordinal (0-based). Sort by this; do not assume array index. */",
        "  order: number;",
        "  /** Create-form default when declared; omit key when no default. */",
        "  create_default?: string | number | boolean;",
        "};",
        "",
        "export type ClassFieldMeta = {",
        "  name_kebab: string;",
        "  name_snake: string;",
        "  display_name: string;",
        "  /** Author attributes; sort by ``order`` for layout (array may match but is not authoritative). */",
        "  attributes: readonly AttributeFieldMeta[];",
        "  /** Snake_case friendly-id attribute name, if any. */",
        "  friendly_id_attr: string | null;",
        "};",
        "",
        "export const CLASS_FIELD_META: Readonly<Record<string, ClassFieldMeta>> = {",
    ]

    for definition in sorted(definitions, key=lambda d: d.name_kebab):
        lines.append(f"  {_ts_string(definition.name_kebab)}: {{")
        lines.append(f"    name_kebab: {_ts_string(definition.name_kebab)},")
        lines.append(f"    name_snake: {_ts_string(definition.name_snake)},")
        lines.append(f"    display_name: {_ts_string(definition.display_name)},")
        lines.append("    attributes: [")
        for order, attr in enumerate(definition.attributes):
            lines.append(f"      {_attribute_literal(attr, order)},")
        lines.append("    ],")
        friendly = definition.friendly_id_attr()
        friendly_snake = (
            "null" if friendly is None else _ts_string(friendly.name_snake)
        )
        lines.append(f"    friendly_id_attr: {friendly_snake},")
        lines.append("  },")

    lines.append("};")
    lines.append("")
    lines.append(
        "export function class_field_meta("
        "class_kebab: string,"
        "): ClassFieldMeta | undefined {"
    )
    lines.append("  return CLASS_FIELD_META[class_kebab];")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def write_field_meta(
    definitions: list[ClassDefinition], output_dir: Path
) -> Path:
    """Write ``field_meta.ts`` under ``output_dir``. Returns the written path."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "field_meta.ts"
    path.write_text(emit_field_meta_module(definitions), encoding="utf-8")
    return path


def _attribute_literal(attr: AttributeDefinition, order: int) -> str:
    references = "null" if attr.references is None else _ts_string(attr.references)
    required = "true" if attr.required else "false"
    parts = [
        f"name_kebab: {_ts_string(attr.name_kebab)}",
        f"name_snake: {_ts_string(attr.name_snake)}",
        f"type_name: {_ts_string(attr.type_name)}",
        f"required: {required}",
        f"references: {references}",
        f"order: {order}",
    ]
    if attr.create_default is not None:
        parts.append(f"create_default: {_ts_json(attr.create_default)}")
    return "{ " + ", ".join(parts) + " }"


def _ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _ts_json(value: str | int | float | bool) -> str:
    return json.dumps(value, ensure_ascii=False)
