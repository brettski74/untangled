/**
 * 24-hour time text field with draft-on-type, commit-on-blur/Enter.
 * Browser `<input type="time">` follows OS locale; this always edits HH:mm:ss.
 */
import { useEffect, useState, type KeyboardEvent } from "react";

/**
 * Resolve blur/Enter commit for a 24-hour time draft field.
 * Returns the draft to display after a commit attempt (`committed` on failure).
 */
export function commit_time_24_draft(
  draft: string,
  committed: string,
  commit: (raw: string) => boolean,
): string {
  if (draft === committed) {
    return draft;
  }
  return commit(draft) ? draft : committed;
}

export function Time24Field({
  className,
  value,
  disabled,
  placeholder,
  aria_label,
  on_commit,
  on_enter,
}: {
  className: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  aria_label: string;
  /** Return false when commit fails (draft reverts to `value`). */
  on_commit: (raw: string) => boolean | void;
  /** Return false when commit fails (draft reverts to `value`). */
  on_enter: (raw: string) => boolean | void;
}) {
  const [draft, set_draft] = useState(value);

  useEffect(() => {
    set_draft(value);
  }, [value]);

  function attempt_commit(via_enter: boolean) {
    const handler = via_enter ? on_enter : on_commit;
    set_draft((current) =>
      commit_time_24_draft(current, value, (raw) => handler(raw) !== false),
    );
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      value={draft}
      onChange={(event) => set_draft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          attempt_commit(false);
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          attempt_commit(true);
        }
      }}
      aria-label={aria_label}
      title="24-hour time (HH:mm:ss)"
    />
  );
}
