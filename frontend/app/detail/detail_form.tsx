import { ExternalLink } from "lucide-react";

import { LocalDatetimeInput } from "../datetime/local_datetime_input";
import { display_field_value } from "../datetime/format";
import type { DetailFieldSlot, DetailLayout } from "./default_layout";
import { fk_open_related } from "./fk_open_related";

export type DetailFormProps = {
  layout: DetailLayout;
  record: Record<string, unknown>;
};

/**
 * Schema-driven read-only default detail form (compact two-column + text).
 */
export function DetailForm({ layout, record }: DetailFormProps) {
  return (
    <div className="space-y-8 px-4 py-4">
      <section aria-label="Compact fields">
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          <CompactColumn slots={layout.compact_left} record={record} />
          <CompactColumn slots={layout.compact_right} record={record} />
        </div>
      </section>

      {layout.text.length > 0 ? (
        <section aria-label="Text fields" className="space-y-4">
          {layout.text.map((slot) => (
            <TextField key={slot.name_snake} slot={slot} record={record} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function CompactColumn({
  slots,
  record,
}: {
  slots: DetailFieldSlot[];
  record: Record<string, unknown>;
}) {
  return (
    <div className="space-y-2">
      {slots.map((slot) => (
        <CompactField key={slot.name_snake} slot={slot} record={record} />
      ))}
    </div>
  );
}

function CompactField({
  slot,
  record,
}: {
  slot: DetailFieldSlot;
  record: Record<string, unknown>;
}) {
  const value = record[slot.name_snake];
  const is_fk = slot.references != null || slot.type_name === "uuid";

  return (
    <div className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-center gap-2">
      <label
        htmlFor={`detail-${slot.name_snake}`}
        className="text-right text-xs font-medium text-slate-600"
      >
        {slot.label}:
      </label>
      <div className="flex min-w-0 items-center gap-1">
        {is_fk && slot.references != null ? (
          <FkReadControl
            id={`detail-${slot.name_snake}`}
            slot={slot}
            value={value}
          />
        ) : (
          <ReadControl
            id={`detail-${slot.name_snake}`}
            slot={slot}
            value={value}
          />
        )}
      </div>
    </div>
  );
}

function TextField({
  slot,
  record,
}: {
  slot: DetailFieldSlot;
  record: Record<string, unknown>;
}) {
  const value = record[slot.name_snake];
  const text = display_field_value(slot.type_name, value);
  const multiline = slot.type_name === "multiline-text";

  return (
    <div className="space-y-1">
      <label
        htmlFor={`detail-${slot.name_snake}`}
        className="block text-left text-xs font-medium text-slate-600"
      >
        {slot.label}
      </label>
      {slot.type_name === "datetime" ? (
        <LocalDatetimeInput
          id={`detail-${slot.name_snake}`}
          value={value}
        />
      ) : multiline ? (
        <textarea
          id={`detail-${slot.name_snake}`}
          readOnly
          rows={4}
          value={text}
          className="w-full resize-y rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900"
        />
      ) : (
        <input
          id={`detail-${slot.name_snake}`}
          type="text"
          readOnly
          value={text}
          className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900"
        />
      )}
    </div>
  );
}

function ReadControl({
  id,
  slot,
  value,
}: {
  id: string;
  slot: DetailFieldSlot;
  value: unknown;
}) {
  if (slot.type_name === "boolean") {
    return (
      <input
        id={id}
        type="checkbox"
        checked={value === true}
        disabled
        className="h-4 w-4"
      />
    );
  }

  if (slot.type_name === "datetime") {
    return <LocalDatetimeInput id={id} value={value} />;
  }

  return (
    <input
      id={id}
      type="text"
      readOnly
      value={display_field_value(slot.type_name, value)}
      className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900"
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
