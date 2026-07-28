/**
 * Session column order and widths for list headers (#78).
 * Fail closed when session order does not exactly match the current column set
 * — no guessing / schema-add insert. Re-seed from loader defaults instead.
 */
import { column_width_px, type ListColumn } from "./columns";

export const MIN_COLUMN_WIDTH_PX = 48;

export type ColumnLayoutSession = {
  /** Attribute snake names in display order. */
  order: string[];
  /** Widths keyed by attribute snake name. */
  widths: Record<string, number>;
};

/** Stable fingerprint of the schema column set (names only, sorted). */
export function column_set_signature(
  columns: readonly ListColumn[],
): string {
  return columns
    .map((column) => column.name_snake)
    .slice()
    .sort()
    .join("\0");
}

/**
 * Seed session layout from loader display columns.
 * Caller must pass columns already ordered by declaration ordinals with the
 * friendly-id display pin applied (``list_display_columns``); this validates
 * ordinals fail-closed but does not re-sort the array.
 */
export function seed_column_layout(
  columns: readonly ListColumn[],
): ColumnLayoutSession {
  for (const column of columns) {
    if (
      typeof column.order !== "number" ||
      !Number.isFinite(column.order) ||
      !Number.isInteger(column.order)
    ) {
      throw new Error(
        `list column '${column.name_snake}' is missing a valid declaration order ordinal`,
      );
    }
  }
  const order = columns.map((column) => column.name_snake);
  const widths: Record<string, number> = {};
  for (const column of columns) {
    widths[column.name_snake] = column_width_px(column.type_name);
  }
  return { order, widths };
}

/**
 * Resolve display columns from session order.
 * Throws when order length/set does not exactly match ``columns`` (fail closed).
 */
export function apply_column_order(
  columns: readonly ListColumn[],
  order: readonly string[],
): ListColumn[] {
  if (order.length !== columns.length) {
    throw new Error(
      "list column session order does not match schema column set",
    );
  }
  const by_name = new Map(
    columns.map((column) => [column.name_snake, column]),
  );
  const seen = new Set<string>();
  const resolved: ListColumn[] = [];
  for (const name of order) {
    if (seen.has(name)) {
      throw new Error(
        `list column session order has duplicate attribute '${name}'`,
      );
    }
    const column = by_name.get(name);
    if (column == null) {
      throw new Error(
        `list column session order references unknown attribute '${name}'`,
      );
    }
    seen.add(name);
    resolved.push(column);
  }
  for (const column of columns) {
    if (!seen.has(column.name_snake)) {
      throw new Error(
        `list column session order is missing attribute '${column.name_snake}'`,
      );
    }
  }
  return resolved;
}

/**
 * Keep session layout when the column set is unchanged; otherwise re-seed.
 * Returns whether the previous session was discarded (caller may warn / reload).
 */
export function reconcile_column_layout(
  columns: readonly ListColumn[],
  session: ColumnLayoutSession | null,
  previous_signature: string | null,
): {
  layout: ColumnLayoutSession;
  signature: string;
  reset: boolean;
} {
  const signature = column_set_signature(columns);
  if (
    session != null &&
    previous_signature === signature &&
    session.order.length === columns.length
  ) {
    try {
      apply_column_order(columns, session.order);
      return { layout: session, signature, reset: false };
    } catch {
      // fall through to re-seed
    }
  }
  return {
    layout: seed_column_layout(columns),
    signature,
    reset: session != null,
  };
}

/** Move column so it lands at ``insert_before_index`` in the *pre-drag* order. */
export function move_column_order(
  order: readonly string[],
  from_index: number,
  insert_before_index: number,
): string[] {
  if (
    from_index < 0 ||
    insert_before_index < 0 ||
    from_index >= order.length ||
    insert_before_index > order.length ||
    from_index === insert_before_index ||
    from_index + 1 === insert_before_index
  ) {
    return [...order];
  }
  const next = [...order];
  const [moved] = next.splice(from_index, 1);
  if (moved == null) {
    return [...order];
  }
  let insert_at = insert_before_index;
  if (from_index < insert_before_index) {
    insert_at -= 1;
  }
  next.splice(insert_at, 0, moved);
  return next;
}

export function clamp_column_width(width_px: number): number {
  if (!Number.isFinite(width_px)) {
    return MIN_COLUMN_WIDTH_PX;
  }
  return Math.max(MIN_COLUMN_WIDTH_PX, Math.round(width_px));
}

export function width_for_attribute(
  widths: Readonly<Record<string, number>>,
  attribute: string,
  type_name: string,
): number {
  const stored = widths[attribute];
  if (typeof stored === "number" && Number.isFinite(stored)) {
    return clamp_column_width(stored);
  }
  return column_width_px(type_name);
}

/**
 * Map pointer X to an insert-before index against header rects (pre-drag).
 * Left half of column i → i; at/after the midpoint → keep scanning;
 * past the last midpoint → ``header_rects.length`` (append).
 */
export function insert_before_index_for_client_x(
  header_rects: readonly { left: number; width: number }[],
  client_x: number,
): number {
  if (header_rects.length === 0) {
    return 0;
  }
  for (let i = 0; i < header_rects.length; i += 1) {
    const rect = header_rects[i];
    if (rect == null) {
      continue;
    }
    if (client_x < rect.left + rect.width / 2) {
      return i;
    }
  }
  return header_rects.length;
}
