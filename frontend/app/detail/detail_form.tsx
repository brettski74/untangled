import { ExternalLink } from "lucide-react";
import type { Ref } from "react";

import { LocalDatetimeInput } from "../datetime/local_datetime_input";
import { display_field_value } from "../datetime/format";
import type { DetailFieldSlot, DetailLayout } from "./default_layout";
import { is_slot_editable } from "./detail_editor";
import { fk_open_related } from "./fk_open_related";

export type DetailFormProps = {
  layout: DetailLayout;
  /** Full record (read-only fields + baseline). */
  record: Record<string, unknown>;
  /** Editable field values (overrides record for editable slots). */
  draft: Record<string, unknown>;
  can_update: boolean;
  on_field_change: (name_snake: string, value: unknown) => void;
  on_field_focus: (name_snake: string) => void;
  on_field_blur: () => void;
  form_ref?: Ref<HTMLDivElement>;
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500";

/**
 * Schema-driven default detail form (compact two-column + text).
 * Editable in place when can_update and the slot is author non-FK.
 */
export function DetailForm({
  layout,
  record,
  draft,
  can_update,
  on_field_change,
  on_field_focus,
  on_field_blur,
  form_ref,
}: DetailFormProps) {
  return (
    <div ref={form_ref} className="space-y-8 px-4 py-4">
      <section aria-label="Compact fields">
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          <CompactColumn
            slots={layout.compact_left}
            record={record}
            draft={draft}
            can_update={can_update}
            on_field_change={on_field_change}
            on_field_focus={on_field_focus}
            on_field_blur={on_field_blur}
          />
          <CompactColumn
            slots={layout.compact_right}
            record={record}
            draft={draft}
            can_update={can_update}
            on_field_change={on_field_change}
            on_field_focus={on_field_focus}
            on_field_blur={on_field_blur}
          />
        </div>
      </section>

      {layout.text.length > 0 ? (
        <section aria-label="Text fields" className="space-y-4">
          {layout.text.map((slot) => (
            <TextField
              key={slot.name_snake}
              slot={slot}
              record={record}
              draft={draft}
              can_update={can_update}
              on_field_change={on_field_change}
              on_field_focus={on_field_focus}
              on_field_blur={on_field_blur}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function CompactColumn({
  slots,
  record,
  draft,
  can_update,
  on_field_change,
  on_field_focus,
  on_field_blur,
}: {
  slots: DetailFieldSlot[];
  record: Record<string, unknown>;
  draft: Record<string, unknown>;
  can_update: boolean;
  on_field_change: (name_snake: string, value: unknown) => void;
  on_field_focus: (name_snake: string) => void;
  on_field_blur: () => void;
}) {
  return (
    <div className="space-y-2">
      {slots.map((slot) => (
        <CompactField
          key={slot.name_snake}
          slot={slot}
          record={record}
          draft={draft}
          can_update={can_update}
          on_field_change={on_field_change}
          on_field_focus={on_field_focus}
          on_field_blur={on_field_blur}
        />
      ))}
    </div>
  );
}

function CompactField({
  slot,
  record,
  draft,
  can_update,
  on_field_change,
  on_field_focus,
  on_field_blur,
}: {
  slot: DetailFieldSlot;
  record: Record<string, unknown>;
  draft: Record<string, unknown>;
  can_update: boolean;
  on_field_change: (name_snake: string, value: unknown) => void;
  on_field_focus: (name_snake: string) => void;
  on_field_blur: () => void;
}) {
  const editable = can_update && is_slot_editable(slot);
  const value = editable
    ? (draft[slot.name_snake] ?? null)
    : record[slot.name_snake];
  const is_fk = slot.references != null;

  return (
    <div className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-center gap-2">
      <label
        htmlFor={`detail-${slot.name_snake}`}
        className="text-right text-xs font-medium text-slate-600"
      >
        {slot.label}:
      </label>
      <div className="flex min-w-0 items-center gap-1">
        {is_fk ? (
          <FkReadControl
            id={`detail-${slot.name_snake}`}
            slot={slot}
            value={value}
          />
        ) : (
          <FieldControl
            id={`detail-${slot.name_snake}`}
            slot={slot}
            value={value}
            editable={editable}
            on_field_change={on_field_change}
            on_field_focus={on_field_focus}
            on_field_blur={on_field_blur}
          />
        )}
      </div>
    </div>
  );
}

function TextField({
  slot,
  record,
  draft,
  can_update,
  on_field_change,
  on_field_focus,
  on_field_blur,
}: {
  slot: DetailFieldSlot;
  record: Record<string, unknown>;
  draft: Record<string, unknown>;
  can_update: boolean;
  on_field_change: (name_snake: string, value: unknown) => void;
  on_field_focus: (name_snake: string) => void;
  on_field_blur: () => void;
}) {
  const editable = can_update && is_slot_editable(slot);
  const value = editable
    ? (draft[slot.name_snake] ?? null)
    : record[slot.name_snake];
  const text = display_field_value(slot.type_name, value);
  const multiline = slot.type_name === "multiline-text";
  const field_class = editable
    ? `w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 ${FOCUS_RING}`
    : "w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900";

  return (
    <div className="space-y-1">
      <label
        htmlFor={`detail-${slot.name_snake}`}
        className="block text-left text-xs font-medium text-slate-600"
      >
        {slot.label}
      </label>
      {multiline ? (
        <textarea
          id={`detail-${slot.name_snake}`}
          readOnly={!editable}
          rows={4}
          value={text}
          className={`${field_class} resize-y`}
          onChange={
            editable
              ? (event) =>
                  on_field_change(
                    slot.name_snake,
                    coerce_text_value(event.target.value),
                  )
              : undefined
          }
          onFocus={
            editable ? () => on_field_focus(slot.name_snake) : undefined
          }
          onBlur={editable ? () => on_field_blur() : undefined}
        />
      ) : (
        <input
          id={`detail-${slot.name_snake}`}
          type="text"
          readOnly={!editable}
          value={text}
          className={field_class}
          onChange={
            editable
              ? (event) =>
                  on_field_change(
                    slot.name_snake,
                    coerce_text_value(event.target.value),
                  )
              : undefined
          }
          onFocus={
            editable ? () => on_field_focus(slot.name_snake) : undefined
          }
          onBlur={editable ? () => on_field_blur() : undefined}
        />
      )}
    </div>
  );
}

function FieldControl({
  id,
  slot,
  value,
  editable,
  on_field_change,
  on_field_focus,
  on_field_blur,
}: {
  id: string;
  slot: DetailFieldSlot;
  value: unknown;
  editable: boolean;
  on_field_change: (name_snake: string, value: unknown) => void;
  on_field_focus: (name_snake: string) => void;
  on_field_blur: () => void;
}) {
  if (slot.type_name === "boolean") {
    return (
      <input
        id={id}
        type="checkbox"
        checked={value === true}
        disabled={!editable}
        className={`h-4 w-4 ${editable ? FOCUS_RING : ""}`}
        onChange={
          editable
            ? (event) => on_field_change(slot.name_snake, event.target.checked)
            : undefined
        }
        onFocus={editable ? () => on_field_focus(slot.name_snake) : undefined}
        onBlur={editable ? () => on_field_blur() : undefined}
      />
    );
  }

  // Dual-control datetime chrome for both editable and read-only detail slots.
  if (slot.type_name === "datetime") {
    return (
      <LocalDatetimeInput
        id={id}
        value={value}
        editable={editable}
        on_change={
          editable
            ? (next) => on_field_change(slot.name_snake, next)
            : undefined
        }
        on_focus={
          editable ? () => on_field_focus(slot.name_snake) : undefined
        }
        on_blur={editable ? () => on_field_blur() : undefined}
      />
    );
  }

  const field_class = editable
    ? `min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 ${FOCUS_RING}`
    : "min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900";

  const display = display_field_value(slot.type_name, value);

  return (
    <input
      id={id}
      type="text"
      readOnly={!editable}
      value={display}
      className={field_class}
      onChange={
        editable
          ? (event) =>
              on_field_change(
                slot.name_snake,
                coerce_value(slot.type_name, event.target.value),
              )
          : undefined
      }
      onFocus={editable ? () => on_field_focus(slot.name_snake) : undefined}
      onBlur={editable ? () => on_field_blur() : undefined}
    />
  );
}

function FkReadControl({
  id,
  slot,
  value,
}: {
  id: string;
  slot: DetailFieldSlot;
  value: unknown;
}) {
  const open = fk_open_related(slot.references, value);
  const has_value = typeof value === "string" && value.trim() !== "";
  const option_label = has_value ? String(value).trim() : "";

  return (
    <>
      <select
        id={id}
        disabled
        className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900"
        value={has_value ? option_label : ""}
      >
        {has_value ? (
          <option value={option_label}>{option_label}</option>
        ) : (
          <option value="">—</option>
        )}
      </select>
      {open.navigable && open.href != null ? (
        <a
          href={open.href}
          target="_blank"
          rel="noopener noreferrer"
          title={open.tooltip}
          aria-label={open.tooltip}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={open.tooltip}
          aria-label={open.tooltip}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </button>
      )}
    </>
  );
}

function coerce_text_value(raw: string): unknown {
  return raw === "" ? null : raw;
}

function coerce_value(type_name: string, raw: string): unknown {
  if (raw === "") {
    // Deliberate clear → null (partial update nullable).
    return null;
  }
  if (type_name === "integer") {
    const n = Number(raw);
    // Unparseable stays as string so Zod/server reject visibly (no silent 0/null).
    return Number.isFinite(n) && Number.isInteger(n) ? n : raw;
  }
  if (type_name === "float") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  // decimal / datetime / uuid / text family stay as string
  return raw;
}
