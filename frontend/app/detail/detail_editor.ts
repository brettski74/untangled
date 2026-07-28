/**
 * Pure detail-edit state helpers: dirty, changed fields, undo chunks.
 */
import type { DetailFieldSlot, DetailLayout } from "./default_layout";

export type DetailDraft = Record<string, unknown>;

export type UndoChunk = {
  /** Field values before this chunk's edits. */
  before: DetailDraft;
  /** Field names touched in this chunk. */
  fields: readonly string[];
};

export type EditorSnapshot = {
  baseline: DetailDraft;
  draft: DetailDraft;
  undo_stack: readonly UndoChunk[];
  /** Field currently receiving contiguous edits; null when no open chunk. */
  active_field: string | null;
};

/** Author non-FK slots are editable when the principal may update. */
export function is_slot_editable(slot: DetailFieldSlot): boolean {
  if (slot.kind !== "author") {
    return false;
  }
  if (slot.references != null) {
    return false;
  }
  return true;
}

export function editable_field_names(layout: DetailLayout): readonly string[] {
  const names: string[] = [];
  for (const slot of [
    ...layout.compact_left,
    ...layout.compact_right,
    ...layout.text,
  ]) {
    if (is_slot_editable(slot)) {
      names.push(slot.name_snake);
    }
  }
  return names;
}

export function seed_draft_from_record(
  record: Record<string, unknown>,
  editable: readonly string[],
): DetailDraft {
  const draft: DetailDraft = {};
  for (const name of editable) {
    draft[name] = record[name] ?? null;
  }
  return draft;
}

export function values_equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a == null && b == null) {
    return true;
  }
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  return false;
}

export function is_dirty(
  baseline: DetailDraft,
  draft: DetailDraft,
  editable: readonly string[],
): boolean {
  for (const name of editable) {
    if (!values_equal(baseline[name] ?? null, draft[name] ?? null)) {
      return true;
    }
  }
  return false;
}

/** Changed editable fields only (PATCH body). */
export function compute_changed_fields(
  baseline: DetailDraft,
  draft: DetailDraft,
  editable: readonly string[],
): DetailDraft {
  const changed: DetailDraft = {};
  for (const name of editable) {
    const next = draft[name] ?? null;
    if (!values_equal(baseline[name] ?? null, next)) {
      changed[name] = next;
    }
  }
  return changed;
}

export function create_editor_snapshot(
  record: Record<string, unknown>,
  editable: readonly string[],
): EditorSnapshot {
  const draft = seed_draft_from_record(record, editable);
  return {
    baseline: { ...draft },
    draft,
    undo_stack: [],
    active_field: null,
  };
}

/**
 * Apply a field edit with same-field chunk merging.
 * Focus/target change (different field) starts a new chunk.
 */
export function apply_field_edit(
  snapshot: EditorSnapshot,
  field: string,
  value: unknown,
): EditorSnapshot {
  const prev_value = snapshot.draft[field];
  if (values_equal(prev_value ?? null, value ?? null)) {
    return snapshot;
  }

  const draft = { ...snapshot.draft, [field]: value };
  let undo_stack = [...snapshot.undo_stack];
  let active_field = snapshot.active_field;

  if (active_field === field && undo_stack.length > 0) {
    // Contiguous same-field edits: keep the chunk's original `before`.
  } else {
    undo_stack = [
      ...undo_stack,
      { before: { [field]: prev_value ?? null }, fields: [field] },
    ];
    active_field = field;
  }

  return { ...snapshot, draft, undo_stack, active_field };
}

/** Call when focus moves to another field (or leaves editable controls). */
export function close_active_chunk(snapshot: EditorSnapshot): EditorSnapshot {
  if (snapshot.active_field == null) {
    return snapshot;
  }
  return { ...snapshot, active_field: null };
}

export function undo_last_chunk(snapshot: EditorSnapshot): EditorSnapshot {
  if (snapshot.undo_stack.length === 0) {
    return { ...snapshot, active_field: null };
  }
  const stack = [...snapshot.undo_stack];
  const chunk = stack.pop()!;
  const draft = { ...snapshot.draft };
  for (const field of chunk.fields) {
    draft[field] = chunk.before[field] ?? null;
  }
  return {
    ...snapshot,
    draft,
    undo_stack: stack,
    active_field: null,
  };
}

/** Successful save or explicit refresh: new baseline, clear undo. */
export function reset_editor_from_record(
  record: Record<string, unknown>,
  editable: readonly string[],
): EditorSnapshot {
  return create_editor_snapshot(record, editable);
}
