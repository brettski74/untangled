/**
 * 24-hour time text field with draft-on-type, commit-on-blur/Enter.
 * Browser `<input type="time">` follows OS locale; this always edits HH:mm:ss.
 */
import { useEffect, useState, type KeyboardEvent } from "react";

/**
 * Resolve blur/Enter commit for a 24-hour time draft field.
 * ``commit`` returns the normalized display time on success, or ``false`` to revert.
 */
export function commit_time_24_draft(
  draft: string,
  committed: string,
  commit: (raw: string) => string | false,
): string {
  if (draft === committed) {
    return draft;
  }
  const next = commit(draft);
  return next === false ? committed : next;
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
  /** Normalized ``HH:mm:ss`` on success; ``false`` reverts draft to ``value``. */
  on_commit: (raw: string) => string | false;
  /** Normalized ``HH:mm:ss`` on success; ``false`` reverts draft to ``value``. */
  on_enter: (raw: string) => string | false;
}) {
  const [draft, set_draft] = useState(value);

  useEffect(() => {
    set_draft(value);
  }, [value]);

  function attempt_commit(via_enter: boolean) {
    const handler = via_enter ? on_enter : on_commit;
    if (draft === value) {
      return;
    }
    // Apply outside the draft updater so side-effecting callers are not double-invoked.
    const next = commit_time_24_draft(draft, value, handler);
    set_draft(next);
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
