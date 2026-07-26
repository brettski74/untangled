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
 * Meta order stays YAML/IR order; friendly-id is moved left-most for display only.
 */
export function list_display_columns(meta: ClassFieldMeta): ListColumn[] {
  const columns = meta.attributes.map((attr) => attribute_to_column(attr));
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
    default:
      return 200;
  }
}
