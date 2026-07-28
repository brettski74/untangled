import { describe, expect, it } from "vitest";

import type { ListColumn } from "./columns";
import {
  apply_column_order,
  clamp_column_width,
  column_set_signature,
  drop_separator_x_for_insert_before,
  insert_before_index_for_client_x,
  MIN_COLUMN_WIDTH_PX,
  move_column_order,
  reconcile_column_layout,
  seed_column_layout,
  total_column_widths_px,
} from "./column_layout";

function col(
  name_snake: string,
  order: number,
  type_name = "text",
): ListColumn {
  return {
    name_snake,
    name_kebab: name_snake.replaceAll("_", "-"),
    type_name,
    references: null,
    label: name_snake,
    is_friendly_id: type_name === "friendly-id",
    order,
  };
}

describe("seed_column_layout", () => {
  it("seeds order and type default widths from display columns", () => {
    const columns = [
      col("number", 0, "friendly-id"),
      col("summary", 1),
      col("status", 2, "status"),
    ];
    const layout = seed_column_layout(columns);
    expect(layout.order).toEqual(["number", "summary", "status"]);
    expect(layout.widths.number).toBe(140);
    expect(layout.widths.summary).toBe(200);
  });
});

describe("apply_column_order", () => {
  const columns = [
    col("number", 0, "friendly-id"),
    col("summary", 1),
    col("status", 2, "status"),
  ];

  it("reorders columns to match session order", () => {
    expect(
      apply_column_order(columns, ["status", "number", "summary"]).map(
        (c) => c.name_snake,
      ),
    ).toEqual(["status", "number", "summary"]);
  });

  it("fails closed when a name is unknown", () => {
    expect(() =>
      apply_column_order(columns, ["status", "number", "nope"]),
    ).toThrow(/unknown attribute/);
  });

  it("fails closed when a name is missing", () => {
    expect(() => apply_column_order(columns, ["status", "number"])).toThrow(
      /does not match/,
    );
  });

  it("fails closed on duplicates", () => {
    expect(() =>
      apply_column_order(columns, ["status", "status", "number"]),
    ).toThrow(/duplicate/);
  });
});

describe("reconcile_column_layout", () => {
  const columns = [
    col("number", 0, "friendly-id"),
    col("summary", 1),
  ];

  it("keeps a matching session", () => {
    const seeded = seed_column_layout(columns);
    const moved = {
      ...seeded,
      order: ["summary", "number"],
      widths: { ...seeded.widths, summary: 320 },
    };
    const result = reconcile_column_layout(
      columns,
      moved,
      column_set_signature(columns),
    );
    expect(result.reset).toBe(false);
    expect(result.layout.order).toEqual(["summary", "number"]);
    expect(result.layout.widths.summary).toBe(320);
  });

  it("re-seeds when the column set signature changes (no insert guess)", () => {
    const prior = seed_column_layout(columns);
    const next_columns = [...columns, col("status", 2, "status")];
    const result = reconcile_column_layout(
      next_columns,
      prior,
      column_set_signature(columns),
    );
    expect(result.reset).toBe(true);
    expect(result.layout.order).toEqual(["number", "summary", "status"]);
  });

  it("re-seeds when session order is corrupt for an unchanged set", () => {
    const signature = column_set_signature(columns);
    const result = reconcile_column_layout(
      columns,
      { order: ["summary"], widths: {} },
      signature,
    );
    expect(result.reset).toBe(true);
    expect(result.layout.order).toEqual(["number", "summary"]);
  });
});

describe("move_column_order", () => {
  it("moves right so the column lands before the drop target", () => {
    // Drag A to insert before C (pre-drag index 2) → [B, A, C]
    expect(move_column_order(["a", "b", "c"], 0, 2)).toEqual(["b", "a", "c"]);
  });

  it("moves left to an earlier insert-before index", () => {
    expect(move_column_order(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move_column_order(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op for self or immediate-next insert-before", () => {
    expect(move_column_order(["a", "b"], 0, 0)).toEqual(["a", "b"]);
    expect(move_column_order(["a", "b"], 0, 1)).toEqual(["a", "b"]);
    expect(move_column_order(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });
});

describe("clamp_column_width", () => {
  it("enforces the minimum width", () => {
    expect(clamp_column_width(10)).toBe(MIN_COLUMN_WIDTH_PX);
    expect(clamp_column_width(120.4)).toBe(120);
  });
});

describe("insert_before_index_for_client_x", () => {
  const rects = [
    { left: 0, width: 100 },
    { left: 100, width: 100 },
    { left: 200, width: 100 },
  ];

  it("returns the column index on the left half", () => {
    expect(insert_before_index_for_client_x(rects, 40)).toBe(0);
    expect(insert_before_index_for_client_x(rects, 120)).toBe(1);
  });

  it("advances past the midpoint toward the next insert-before", () => {
    expect(insert_before_index_for_client_x(rects, 60)).toBe(1);
    expect(insert_before_index_for_client_x(rects, 160)).toBe(2);
  });

  it("returns length when past the last midpoint (append)", () => {
    expect(insert_before_index_for_client_x(rects, 260)).toBe(3);
  });
});

describe("drop_separator_x_for_insert_before", () => {
  const rects = [
    { left: 10, width: 100 },
    { left: 110, width: 80 },
    { left: 190, width: 120 },
  ];

  it("returns left of first when inserting at the start", () => {
    expect(drop_separator_x_for_insert_before(rects, 0)).toBe(10);
  });

  it("returns left of the target header for a mid insert", () => {
    expect(drop_separator_x_for_insert_before(rects, 1)).toBe(110);
    expect(drop_separator_x_for_insert_before(rects, 2)).toBe(190);
  });

  it("returns right edge of last when appending", () => {
    expect(drop_separator_x_for_insert_before(rects, 3)).toBe(310);
  });

  it("returns null for an empty rect list", () => {
    expect(drop_separator_x_for_insert_before([], 0)).toBeNull();
  });
});

describe("total_column_widths_px", () => {
  it("sums clamped widths for the column set", () => {
    const columns = [col("a", 0, "text"), col("b", 1, "friendly-id")];
    expect(
      total_column_widths_px(columns, { a: 100, b: 140 }),
    ).toBe(240);
  });

  it("falls back to type defaults when a width is missing", () => {
    const columns = [col("a", 0, "text"), col("b", 1, "friendly-id")];
    // text default 200 + friendly-id default 140
    expect(total_column_widths_px(columns, {})).toBe(340);
  });

  it("clamps below-minimum widths before summing", () => {
    const columns = [col("a", 0, "text")];
    expect(total_column_widths_px(columns, { a: 10 })).toBe(
      MIN_COLUMN_WIDTH_PX,
    );
  });

  it("returns 0 for an empty column list", () => {
    expect(total_column_widths_px([], {})).toBe(0);
  });
});
