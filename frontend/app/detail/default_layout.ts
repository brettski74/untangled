/**
 * Rule-based default detail layout partitions from generated field meta.
 */
import type {
  AttributeFieldMeta,
  ClassFieldMeta,
} from "../generated/field_meta";
import {
  attribute_display_label,
  attributes_in_declaration_order,
} from "../list/columns";

const TEXT_SECTION_TYPES = new Set(["text", "multiline_text"]);

/** Closed platform audit set (not in author field-meta). Fixed display order. */
export const DETAIL_AUDIT_FIELDS = [
  {
    name_snake: "created_at",
    name_kebab: "created-at",
    type_name: "datetime",
    references: null as string | null,
  },
  {
    name_snake: "created_by",
    name_kebab: "created-by",
    type_name: "uuid",
    references: "user",
  },
  {
    name_snake: "updated_at",
    name_kebab: "updated-at",
    type_name: "datetime",
    references: null as string | null,
  },
  {
    name_snake: "updated_by",
    name_kebab: "updated-by",
    type_name: "uuid",
    references: "user",
  },
] as const;

export type DetailFieldSlot = {
  name_snake: string;
  name_kebab: string;
  type_name: string;
  label: string;
  references: string | null;
  kind: "author" | "friendly_id" | "audit";
};

export type DetailLayout = {
  compact: DetailFieldSlot[];
  text: DetailFieldSlot[];
  compact_left: DetailFieldSlot[];
  compact_right: DetailFieldSlot[];
};

export function is_text_section_type(type_name: string): boolean {
  return TEXT_SECTION_TYPES.has(type_name);
}

/**
 * Partition class field meta into compact + text sections for the default view.
 * Author attributes follow declaration order; friendly_id is pinned top-left;
 * system audit fields append after author compact in fixed platform order.
 * ``id`` is never included.
 */
export function partition_detail_layout(meta: ClassFieldMeta): DetailLayout {
  const ordered = attributes_in_declaration_order(meta.attributes);
  const text: DetailFieldSlot[] = [];
  const compact_author: DetailFieldSlot[] = [];
  let friendly: DetailFieldSlot | null = null;

  for (const attr of ordered) {
    if (attr.name_snake === "id") {
      continue;
    }
    const slot = attribute_to_slot(attr);
    if (is_text_section_type(attr.type_name)) {
      text.push(slot);
      continue;
    }
    if (
      attr.type_name === "friendly_id" ||
      (meta.friendly_id_attr != null &&
        attr.name_snake === meta.friendly_id_attr)
    ) {
      friendly = { ...slot, kind: "friendly_id" };
      continue;
    }
    compact_author.push(slot);
  }

  const audit: DetailFieldSlot[] = DETAIL_AUDIT_FIELDS.map((field) => ({
    name_snake: field.name_snake,
    name_kebab: field.name_kebab,
    type_name: field.type_name,
    label: attribute_display_label(field.name_kebab),
    references: field.references,
    kind: "audit" as const,
  }));

  const compact: DetailFieldSlot[] = [
    ...(friendly != null ? [friendly] : []),
    ...compact_author,
    ...audit,
  ];

  const { left, right } = split_compact_columns(compact);
  return {
    compact,
    text,
    compact_left: left,
    compact_right: right,
  };
}

/** Fill down the left column, then the right; row count = ceil(n / 2). */
export function split_compact_columns(
  slots: readonly DetailFieldSlot[],
): { left: DetailFieldSlot[]; right: DetailFieldSlot[] } {
  const rows = Math.ceil(slots.length / 2);
  return {
    left: slots.slice(0, rows),
    right: slots.slice(rows),
  };
}

function attribute_to_slot(attr: AttributeFieldMeta): DetailFieldSlot {
  return {
    name_snake: attr.name_snake,
    name_kebab: attr.name_kebab,
    type_name: attr.type_name,
    label: attribute_display_label(attr.name_kebab),
    references: attr.references,
    kind: "author",
  };
}
