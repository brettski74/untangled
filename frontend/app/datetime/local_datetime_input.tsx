import { useEffect, useState } from "react";

import { local_datetime_control_parts } from "./format";

export type LocalDatetimeInputProps = {
  id: string;
  value: unknown;
};

const field_class =
  "rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900";

/**
 * Read-only dual-control datetime chrome for detail forms.
 * Native date + 24-hour time text, both disabled; fixed content widths so the
 * pair stays visually tied together (does not grow with the layout).
 */
export function LocalDatetimeInput({ id, value }: LocalDatetimeInputProps) {
  const [parts, set_parts] = useState({ date: "", time: "" });

  useEffect(() => {
    set_parts(local_datetime_control_parts(value));
  }, [value]);

  return (
    <div className="inline-flex items-center gap-1">
      <input
        id={id}
        type="date"
        lang="en-GB"
        autoComplete="off"
        disabled
        value={parts.date}
        aria-label="Date"
        className={`${field_class} w-[9.5rem] shrink-0`}
      />
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled
        value={parts.time}
        placeholder={parts.date === "" ? "" : "HH:mm:ss"}
        aria-label="Time"
        title="24-hour time (HH:mm:ss)"
        size={9}
        className={`${field_class} w-[calc(9ch+1rem)] shrink-0 font-mono`}
      />
    </div>
  );
}
