import {
  useEffect,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

import {
  iso_to_local_combined,
  local_combined_to_iso,
  local_datetime_control_parts,
} from "./format";
import {
  apply_datetime_date_change,
  apply_datetime_time_change,
  DATETIME_FROM_DEFAULT_TIME,
  split_datetime_local,
} from "./local_datetime_compose";
import { sync_datetime_chrome_from_committed } from "./local_datetime_chrome_sync";
import { Time24Field } from "./time_24_field";

export type LocalDatetimeInputProps = {
  id: string;
  value: unknown;
  editable?: boolean;
  on_change?: (value: string | null) => void;
  on_focus?: () => void;
  on_blur?: () => void;
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500";

/**
 * Dual-control datetime chrome for detail forms (native date + 24-hour time text).
 * Read-only and editable modes share the same pair; dense list cells stay plain text.
 * On pair blur, remount the date input so incomplete native drafts match committed value
 * (parity with Time24Field revert-on-failed-commit).
 */
export function LocalDatetimeInput({
  id,
  value,
  editable = false,
  on_change,
  on_focus,
  on_blur,
}: LocalDatetimeInputProps) {
  const [parts, set_parts] = useState({ date: "", time: "" });
  const [date_remount_key, set_date_remount_key] = useState(0);

  useEffect(() => {
    set_parts(local_datetime_control_parts(value));
  }, [value]);

  const field_class = editable
    ? `rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 ${FOCUS_RING}`
    : "rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-900";

  const local =
    typeof value === "string" ? iso_to_local_combined(value) : "";

  function commit_iso(combined: string) {
    if (!on_change) {
      return;
    }
    if (combined.trim() === "") {
      on_change(null);
      return;
    }
    const iso = local_combined_to_iso(combined);
    on_change(iso === undefined ? null : iso);
  }

  function commit_time(raw: string): string | false {
    const next = apply_datetime_time_change(
      raw,
      local,
      DATETIME_FROM_DEFAULT_TIME,
    );
    if (!next.ok) {
      return false;
    }
    commit_iso(next.combined);
    return split_datetime_local(next.combined).time;
  }

  const pair: ReactNode = (
    <>
      <input
        key={date_remount_key}
        id={id}
        type="date"
        lang="en-GB"
        autoComplete="off"
        disabled={!editable}
        value={parts.date}
        aria-label="Date"
        className={`${field_class} w-[9.5rem] shrink-0`}
        onChange={
          editable
            ? (event) => {
                const combined = apply_datetime_date_change(
                  "from",
                  event.target.value,
                  local,
                );
                commit_iso(combined);
              }
            : undefined
        }
      />
      {editable ? (
        <Time24Field
          className={`${field_class} w-[calc(9ch+1rem)] shrink-0 font-mono`}
          value={parts.time}
          disabled={parts.date === ""}
          placeholder={parts.date === "" ? "" : "HH:mm:ss"}
          aria_label="Time"
          on_commit={(raw) => commit_time(raw)}
          on_enter={(raw) => commit_time(raw)}
        />
      ) : (
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
      )}
    </>
  );

  if (!editable) {
    return <div className="inline-flex items-center gap-1">{pair}</div>;
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      onFocus={() => on_focus?.()}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) {
          return;
        }
        const synced = sync_datetime_chrome_from_committed(
          date_remount_key,
          value,
        );
        set_date_remount_key(synced.remount_key);
        set_parts(synced.parts);
        on_blur?.();
      }}
    >
      {pair}
    </div>
  );
}
