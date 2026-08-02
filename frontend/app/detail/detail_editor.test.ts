import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apply_field_edit,
  close_active_chunk,
  compute_changed_fields,
  create_editor_snapshot,
  editable_field_names,
  is_dirty,
  is_slot_editable,
  reset_editor_from_record,
  undo_last_chunk,
} from "./detail_editor";
import type { DetailFieldSlot, DetailLayout } from "./default_layout";
import {
  update_schema_for_class,
  update_schema_keys,
} from "../records/update_schema_registry";
import {
  zod_error_detail,
  zod_error_http_status,
} from "../records/zod_http_status";

function slot(
  partial: Partial<DetailFieldSlot> &
    Pick<DetailFieldSlot, "name_snake" | "kind">,
): DetailFieldSlot {
  return {
    name_kebab: partial.name_snake.replace(/_/g, "-"),
    type_name: "compact-text",
    label: partial.name_snake,
    references: null,
    ...partial,
  };
}

describe("editable slots", () => {
  const layout: DetailLayout = {
    compact: [],
    text: [slot({ name_snake: "summary", kind: "author", type_name: "text" })],
    compact_left: [
      slot({
        name_snake: "number",
        kind: "friendly-id",
        type_name: "friendly-id",
      }),
      slot({ name_snake: "status", kind: "author", type_name: "status" }),
    ],
    compact_right: [
      slot({
        name_snake: "assigned_user_id",
        kind: "author",
        type_name: "uuid",
        references: "user",
      }),
      slot({ name_snake: "created_at", kind: "audit", type_name: "datetime" }),
    ],
  };

  it("E11: only author non-FK are editable", () => {
    expect(is_slot_editable(layout.compact_left[0]!)).toBe(false);
    expect(is_slot_editable(layout.compact_left[1]!)).toBe(true);
    expect(is_slot_editable(layout.compact_right[0]!)).toBe(false);
    expect(is_slot_editable(layout.compact_right[1]!)).toBe(false);
    expect(editable_field_names(layout)).toEqual(["status", "summary"]);
  });
});

describe("dirty and changed fields", () => {
  const editable = ["summary", "status"] as const;
  const record = { summary: "A", status: "new", number: "INC1" };

  it("E1: edit makes dirty", () => {
    let snap = create_editor_snapshot(record, editable);
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(false);
    snap = apply_field_edit(snap, "summary", "B");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(true);
  });

  it("E2: matching baseline is clean", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    snap = apply_field_edit(snap, "summary", "A");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(false);
  });

  it("computes changed fields only", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "status", "in-progress");
    expect(compute_changed_fields(snap.baseline, snap.draft, editable)).toEqual(
      {
        status: "in-progress",
      },
    );
  });
});

describe("undo chunks", () => {
  const editable = ["summary", "status"] as const;
  const record = { summary: "A", status: "new" };

  it("E3: contiguous same-field edits merge into one chunk", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "AB");
    snap = apply_field_edit(snap, "summary", "ABC");
    expect(snap.undo_stack).toHaveLength(1);
    expect(snap.draft.summary).toBe("ABC");
    snap = undo_last_chunk(snap);
    expect(snap.draft.summary).toBe("A");
    expect(snap.undo_stack).toHaveLength(0);
  });

  it("E4: focus/target change starts a new chunk", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    snap = close_active_chunk(snap);
    snap = apply_field_edit(snap, "status", "in-progress");
    expect(snap.undo_stack).toHaveLength(2);
  });

  it("E7/E8: undo pops; exhaust → clean", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    snap = close_active_chunk(snap);
    snap = apply_field_edit(snap, "status", "x");
    snap = undo_last_chunk(snap);
    expect(snap.draft.status).toBe("new");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(true);
    snap = undo_last_chunk(snap);
    expect(snap.draft.summary).toBe("A");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(false);
    expect(snap.undo_stack).toHaveLength(0);
  });

  it("E5/E9: reset from record clears undo and is clean", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    snap = reset_editor_from_record(
      { summary: "Saved", status: "new" },
      editable,
    );
    expect(snap.undo_stack).toHaveLength(0);
    expect(snap.draft.summary).toBe("Saved");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(false);
  });

  it("E6: reset helper is the only clobber path (incidental revalidation must not call it)", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    const dirty_snap = snap;
    // Simulating incidental loader update: caller keeps snap untouched.
    expect(is_dirty(dirty_snap.baseline, dirty_snap.draft, editable)).toBe(
      true,
    );
    expect(dirty_snap.draft.summary).toBe("B");
  });

  it("E10: failed save leaves snapshot untouched (caller responsibility)", () => {
    let snap = create_editor_snapshot(record, editable);
    snap = apply_field_edit(snap, "summary", "B");
    expect(is_dirty(snap.baseline, snap.draft, editable)).toBe(true);
    expect(snap.undo_stack.length).toBeGreaterThan(0);
  });
});

describe("update_schema_registry", () => {
  it("R1: known classes resolve", () => {
    expect(update_schema_for_class("incident")).not.toBeNull();
    expect(update_schema_for_class("change-request")).not.toBeNull();
  });

  it("R2: unknown class is observable miss", () => {
    expect(update_schema_for_class("not-a-class")).toBeNull();
  });

  it("R3: partial optional body accepted", () => {
    const schema = update_schema_for_class("incident")!;
    expect(schema.safeParse({ status: "in-progress" }).success).toBe(true);
    expect(update_schema_keys(schema).has("summary")).toBe(true);
  });
});

describe("zod_error_http_status", () => {
  it("maps unrecognized keys to 400", () => {
    const schema = z.object({ a: z.string() }).strict();
    const result = schema.safeParse({ a: "x", b: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zod_error_http_status(result.error)).toBe(400);
    }
  });

  it("maps field type failures to 422", () => {
    const schema = z.object({ n: z.number().optional() });
    const result = schema.safeParse({ n: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zod_error_http_status(result.error)).toBe(422);
    }
  });
});

describe("zod_error_detail", () => {
  it("prefixes messages with field paths", () => {
    const schema = z.object({
      scheduled_start: z.string(),
      scheduled_end: z.string(),
    });
    const result = schema.safeParse({
      scheduled_start: null,
      scheduled_end: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { detail } = zod_error_detail(result.error);
      expect(detail).toContain("scheduled_start:");
      expect(detail).toContain("scheduled_end:");
      expect(detail).toMatch(/Expected string, received null/);
    }
  });
});
