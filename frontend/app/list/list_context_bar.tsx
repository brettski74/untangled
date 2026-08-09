import {
  FilePlus,
  Link as LinkIcon,
  Menu,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { AttributeFieldMeta } from "../generated/field_meta";
import { attribute_display_label } from "./columns";
import {
  apply_datetime_date_change,
  apply_datetime_time_change,
  DATETIME_FROM_DEFAULT_TIME,
  DATETIME_TO_DEFAULT_TIME,
  split_datetime_local,
} from "../datetime/local_datetime_compose";
import { Time24Field } from "../datetime/time_24_field";
import {
  and_predicates,
  build_quick_filter_predicates,
  quick_filter_control_kind,
  quick_filterable_attributes,
  type QuickFilterValues,
  type SearchPredicate,
} from "./quick_filter";

export type ListSearchPayload = {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  effective_predicate: SearchPredicate | null;
};

export type ListContextBarProps = {
  class_display_name: string;
  collection: string;
  /** Same destination identity as DestinationListPage path sync (`loaderData.path`). */
  list_path: string;
  can_create: boolean;
  attributes: readonly AttributeFieldMeta[];
  /** Shared with list route / filter editor — always-current effective predicate. */
  effective_ref: MutableRefObject<SearchPredicate | null>;
  busy: boolean;
  /**
   * List search seam — same object shape as the route poster.
   * Omit ``sort``; the route keeps the current user sort list.
   * Quick-filter Enter should pass ``reset_start: true``; Refresh should not.
   */
  submit_search: (args: {
    predicate: SearchPredicate | null;
    reset_start?: boolean;
  }) => void;
  /** Controlled quick-filter chrome — owned by DestinationListPage. */
  selected_name: string;
  values: QuickFilterValues;
  warning: string | null;
  on_selected_name_change: (name: string) => void;
  on_values_change: (values: QuickFilterValues) => void;
  on_warning_change: (warning: string | null) => void;
};

const MENU_STUBS = [
  "Export…",
  "Print…",
  "Share view…",
  "Column defaults…",
  "Preferences…",
] as const;

/**
 * Interactive list chrome for the shell context bar (#76).
 * Quick-filter field/values/warning are controlled by the list route.
 * Predicate submit / fetcher ownership lives on DestinationListPage (#77).
 */
export function ListContextBar({
  class_display_name,
  collection,
  list_path,
  can_create,
  attributes,
  effective_ref,
  busy,
  submit_search,
  selected_name,
  values,
  warning,
  on_selected_name_change,
  on_values_change,
  on_warning_change,
}: ListContextBarProps) {
  const filterable = useMemo(
    () => quick_filterable_attributes(attributes),
    [attributes],
  );
  const selected =
    filterable.find((attr) => attr.name_snake === selected_name) ??
    filterable[0] ??
    null;
  const [menu_open, set_menu_open] = useState(false);
  const [copied, set_copied] = useState(false);
  const menu_id = useId();
  /** Always-current quick-filter values (Enter must not read a stale render). */
  const values_ref = useRef(values);
  values_ref.current = values;

  function on_refresh() {
    on_warning_change(null);
    submit_search({ predicate: effective_ref.current });
  }

  function on_quick_filter_enter(override_values?: QuickFilterValues) {
    if (selected == null) {
      return;
    }
    const filter_values = override_values ?? values_ref.current;
    const built = build_quick_filter_predicates(selected, filter_values);
    if (!built.ok) {
      on_warning_change(built.warning);
      return;
    }
    if (built.predicates.length === 0) {
      on_warning_change("Nothing to apply — enter a filter value.");
      return;
    }
    on_warning_change(null);
    const next = and_predicates(effective_ref.current, ...built.predicates);
    submit_search({ predicate: next, reset_start: true });
  }

  async function on_copy_link() {
    const absolute = new URL(list_path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absolute);
      set_copied(true);
      window.setTimeout(() => set_copied(false), 1500);
    } catch {
      on_warning_change("Could not copy link.");
    }
  }

  const kind =
    selected == null ? null : quick_filter_control_kind(selected.type_name);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
      <div className="flex min-w-0 items-center gap-1">
        <ContextMenu
          open={menu_open}
          on_toggle={() => set_menu_open((open) => !open)}
          on_close={() => set_menu_open(false)}
          menu_id={menu_id}
        />

        <span className="truncate px-1 font-semibold text-[var(--color-shell-chrome-fg)]">
          {class_display_name}
        </span>

        {can_create ? (
          <a
            href={`/${collection}/new`}
            title="New"
            aria-label="New"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--color-shell-chrome-fg)] hover:bg-white/10"
          >
            <FilePlus className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <span
            title="New (unavailable)"
            aria-label="New (unavailable)"
            aria-disabled="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--color-shell-chrome-muted)] opacity-50"
          >
            <FilePlus className="h-4 w-4" aria-hidden />
          </span>
        )}

        {filterable.length > 0 && selected != null && kind != null ? (
          <div className="flex min-w-0 items-center gap-1">
            <label className="sr-only" htmlFor={`${menu_id}-field`}>
              Quick filter field
            </label>
            <select
              id={`${menu_id}-field`}
              className="h-7 max-w-40 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-1 text-[var(--color-shell-chrome-fg)]"
              value={selected.name_snake}
              autoComplete="off"
              onChange={(event) => on_selected_name_change(event.target.value)}
            >
              {filterable.map((attr) => (
                <option key={attr.name_snake} value={attr.name_snake}>
                  {attribute_display_label(attr.name_snake)}
                </option>
              ))}
            </select>
            <QuickFilterControls
              kind={kind}
              values={values}
              set_values={on_values_change}
              on_warning={on_warning_change}
              on_enter={on_quick_filter_enter}
            />
          </div>
        ) : null}

        {warning != null ? (
          <span className="truncate text-amber-300" role="status">
            {warning}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ContextIconButton
          label={busy ? "Refreshing…" : "Refresh"}
          on_click={on_refresh}
          disabled={busy}
        >
          <RefreshCw
            className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
            aria-hidden
          />
        </ContextIconButton>
        <ContextIconButton
          label={copied ? "Link copied" : "Copy link"}
          on_click={() => {
            void on_copy_link();
          }}
        >
          <LinkIcon className="h-4 w-4" aria-hidden />
        </ContextIconButton>
      </div>
    </div>
  );
}

function ContextMenu({
  open,
  on_toggle,
  on_close,
  menu_id,
}: {
  open: boolean;
  on_toggle: () => void;
  on_close: () => void;
  menu_id: string;
}) {
  const root_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function on_pointer(event: MouseEvent) {
      if (
        root_ref.current != null &&
        !root_ref.current.contains(event.target as Node)
      ) {
        on_close();
      }
    }
    function on_key(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        on_close();
      }
    }
    document.addEventListener("mousedown", on_pointer);
    document.addEventListener("keydown", on_key);
    return () => {
      document.removeEventListener("mousedown", on_pointer);
      document.removeEventListener("keydown", on_key);
    };
  }, [open, on_close]);

  return (
    <div className="relative" ref={root_ref}>
      <ContextIconButton
        label="Context menu"
        on_click={on_toggle}
        pressed={open}
        controls={menu_id}
      >
        <Menu className="h-4 w-4" aria-hidden />
      </ContextIconButton>
      {open ? (
        <ul
          id={menu_id}
          role="menu"
          className="absolute top-full left-0 z-20 mt-1 min-w-44 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] py-1 shadow-lg"
        >
          {MENU_STUBS.map((label) => (
            <li key={label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled
                className="block w-full cursor-not-allowed px-3 py-1.5 text-left text-[var(--color-shell-chrome-muted)]"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QuickFilterControls({
  kind,
  values,
  set_values,
  on_warning,
  on_enter,
}: {
  kind: NonNullable<ReturnType<typeof quick_filter_control_kind>>;
  values: QuickFilterValues;
  set_values: (next: QuickFilterValues) => void;
  on_warning: (warning: string | null) => void;
  on_enter: (override_values?: QuickFilterValues) => void;
}) {
  function on_key_down(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      on_enter();
    }
  }

  if (kind === "text" || kind === "friendly_id") {
    return (
      <input
        type="text"
        autoComplete="off"
        className="h-7 w-36 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-2 text-[var(--color-shell-chrome-fg)]"
        value={values.text ?? ""}
        onChange={(event) =>
          set_values({ ...values, text: event.target.value })
        }
        onKeyDown={on_key_down}
        aria-label="Quick filter value"
      />
    );
  }

  if (kind === "boolean") {
    return (
      <label className="inline-flex items-center gap-1 px-1 text-[var(--color-shell-chrome-fg)]">
        <input
          type="checkbox"
          checked={values.not === true}
          onChange={(event) =>
            set_values({ ...values, not: event.target.checked })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              on_enter();
            }
          }}
        />
        Not
      </label>
    );
  }

  if (kind === "datetime") {
    return (
      <DatetimeRangeControls
        values={values}
        set_values={set_values}
        on_warning={on_warning}
        on_enter={on_enter}
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      <label className="flex items-center gap-1 text-[var(--color-shell-chrome-muted)]">
        From:
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="h-7 w-32 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-1 text-[var(--color-shell-chrome-fg)]"
          value={values.from ?? ""}
          onChange={(event) =>
            set_values({ ...values, from: event.target.value })
          }
          onKeyDown={on_key_down}
          aria-label="Quick filter from"
        />
      </label>
      <label className="flex items-center gap-1 text-[var(--color-shell-chrome-muted)]">
        To:
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="h-7 w-32 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-1 text-[var(--color-shell-chrome-fg)]"
          value={values.to ?? ""}
          onChange={(event) =>
            set_values({ ...values, to: event.target.value })
          }
          onKeyDown={on_key_down}
          aria-label="Quick filter to"
        />
      </label>
    </div>
  );
}

function DatetimeRangeControls({
  values,
  set_values,
  on_warning,
  on_enter,
}: {
  values: QuickFilterValues;
  set_values: (next: QuickFilterValues) => void;
  on_warning: (warning: string | null) => void;
  on_enter: (override_values?: QuickFilterValues) => void;
}) {
  const from_parts = split_datetime_local(values.from);
  const to_parts = split_datetime_local(values.to);
  const values_ref = useRef(values);
  values_ref.current = values;
  const field_class =
    "h-7 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-1 text-[var(--color-shell-chrome-fg)]";

  function apply_time(
    side: "from" | "to",
    raw_time: string,
    base: QuickFilterValues = values_ref.current,
  ): QuickFilterValues | null {
    const current = side === "from" ? base.from : base.to;
    const default_time =
      side === "from" ? DATETIME_FROM_DEFAULT_TIME : DATETIME_TO_DEFAULT_TIME;
    const next = apply_datetime_time_change(raw_time, current, default_time);
    if (!next.ok) {
      on_warning(next.warning);
      return null;
    }
    on_warning(null);
    const updated =
      side === "from"
        ? { ...base, from: next.combined }
        : { ...base, to: next.combined };
    set_values(updated);
    values_ref.current = updated;
    return updated;
  }

  function commit_time_display(
    side: "from" | "to",
    raw: string,
  ): string | false {
    const updated = apply_time(side, raw);
    if (updated == null) {
      return false;
    }
    const combined = side === "from" ? updated.from : updated.to;
    return split_datetime_local(combined).time;
  }

  function commit_date_and_enter(
    side: "from" | "to",
    date_value: string,
  ): void {
    const base = values_ref.current;
    const combined = apply_datetime_date_change(
      side,
      date_value,
      side === "from" ? base.from : base.to,
    );
    const updated =
      side === "from" ? { ...base, from: combined } : { ...base, to: combined };
    set_values(updated);
    values_ref.current = updated;
    on_warning(null);
    on_enter(updated);
  }

  function on_date_enter(
    side: "from" | "to",
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key !== "Enter") {
      return;
    }
    // Stop native form submit; do not block the date input's own commit.
    event.preventDefault();
    const input = event.currentTarget;
    const live = input.value.trim();
    if (live !== "") {
      commit_date_and_enter(side, live);
      return;
    }
    // Some browsers commit the picker value after keydown; retry on next tick.
    window.setTimeout(() => {
      const delayed = input.value.trim();
      if (delayed !== "") {
        commit_date_and_enter(side, delayed);
        return;
      }
      on_enter(values_ref.current);
    }, 0);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[var(--color-shell-chrome-muted)]">From:</span>
      <input
        type="date"
        lang="en-GB"
        autoComplete="off"
        className={`${field_class} w-[9.5rem]`}
        value={from_parts.date}
        onChange={(event) => {
          on_warning(null);
          const updated = {
            ...values_ref.current,
            from: apply_datetime_date_change(
              "from",
              event.target.value,
              values_ref.current.from,
            ),
          };
          values_ref.current = updated;
          set_values(updated);
        }}
        onKeyDown={(event) => on_date_enter("from", event)}
        aria-label="Quick filter from date"
      />
      <Time24Field
        className={`${field_class} w-[6.5rem] font-mono tabular-nums`}
        value={from_parts.time}
        disabled={from_parts.date === ""}
        placeholder={from_parts.date === "" ? "" : "HH:mm:ss"}
        aria_label="Quick filter from time (24-hour)"
        on_commit={(raw) => commit_time_display("from", raw)}
        on_enter={(raw) => {
          const display = commit_time_display("from", raw);
          if (display === false) {
            return false;
          }
          on_enter(values_ref.current);
          return display;
        }}
      />
      <span className="text-[var(--color-shell-chrome-muted)]">To:</span>
      <input
        type="date"
        lang="en-GB"
        autoComplete="off"
        className={`${field_class} w-[9.5rem]`}
        value={to_parts.date}
        onChange={(event) => {
          on_warning(null);
          const updated = {
            ...values_ref.current,
            to: apply_datetime_date_change(
              "to",
              event.target.value,
              values_ref.current.to,
            ),
          };
          values_ref.current = updated;
          set_values(updated);
        }}
        onKeyDown={(event) => on_date_enter("to", event)}
        aria-label="Quick filter to date"
      />
      <Time24Field
        className={`${field_class} w-[6.5rem] font-mono tabular-nums`}
        value={to_parts.time}
        disabled={to_parts.date === ""}
        placeholder={to_parts.date === "" ? "" : "HH:mm:ss"}
        aria_label="Quick filter to time (24-hour)"
        on_commit={(raw) => commit_time_display("to", raw)}
        on_enter={(raw) => {
          const display = commit_time_display("to", raw);
          if (display === false) {
            return false;
          }
          on_enter(values_ref.current);
          return display;
        }}
      />
    </div>
  );
}

function ContextIconButton({
  label,
  on_click,
  pressed,
  disabled,
  controls,
  children,
}: {
  label: string;
  on_click: () => void;
  pressed?: boolean;
  disabled?: boolean;
  controls?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-controls={controls}
      aria-expanded={controls != null ? pressed : undefined}
      title={label}
      disabled={disabled}
      onClick={on_click}
      className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--color-shell-chrome-fg)] hover:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
