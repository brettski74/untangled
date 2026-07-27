import type {
  AttributeFieldMeta,
  ClassFieldMeta,
} from "../generated/field_meta";

export type ListColumn = {
  name_snake: string;
  name_kebab: string;
  type_name: string;
  references: string | null;
  label: string;
  is_friendly_id: boolean;
};

/**
 * Build list display columns from generated field meta.
 * Meta attributes are sorted by declaration ``order``; friendly-id is then
 * moved left-most for list display only.
 */
export function list_display_columns(meta: ClassFieldMeta): ListColumn[] {
  const ordered = attributes_in_declaration_order(meta.attributes);
  const columns = ordered.map((attr) => attribute_to_column(attr));
  const friendly = meta.friendly_id_attr;
  if (friendly == null) {
    return columns;
  }
  const index = columns.findIndex((column) => column.name_snake === friendly);
  if (index <= 0) {
    return columns;
  }
  const [friendly_column] = columns.splice(index, 1);
  if (friendly_column == null) {
    return columns;
  }
  return [friendly_column, ...columns];
}

/**
 * Sort field-meta attributes by declaration ``order``.
 * Fail closed if any attribute is missing a finite ordinal.
 */
export function attributes_in_declaration_order(
  attributes: readonly AttributeFieldMeta[],
): AttributeFieldMeta[] {
  for (const attr of attributes) {
    if (
      typeof attr.order !== "number" ||
      !Number.isFinite(attr.order) ||
      !Number.isInteger(attr.order)
    ) {
      throw new Error(
        `field meta for attribute '${attr.name_kebab}' is missing a valid ` +
          `declaration order ordinal`,
      );
    }
  }
  return [...attributes].sort((left, right) => left.order - right.order);
}

export function attribute_display_label(name_kebab: string): string {
  return name_kebab
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function attribute_to_column(attr: AttributeFieldMeta): ListColumn {
  return {
    name_snake: attr.name_snake,
    name_kebab: attr.name_kebab,
    type_name: attr.type_name,
    references: attr.references,
    label: attribute_display_label(attr.name_kebab),
    is_friendly_id: attr.type_name === "friendly-id",
  };
}

/** Sane default column widths (px) by attribute type — horizontal scroll as needed. */
export function column_width_px(type_name: string): number {
  switch (type_name) {
    case "friendly-id":
      return 140;
    case "boolean":
      return 96;
    case "integer":
    case "float":
    case "decimal":
      return 112;
    case "datetime":
      return 180;
    case "uuid":
      return 280;
    case "string":
    case "compact-text":
    case "choice":
    case "status":
    case "text":
    case "multiline-text":
      return 200;
    default:
      return 200;
  }
}
