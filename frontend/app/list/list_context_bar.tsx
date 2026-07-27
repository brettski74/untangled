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
  type ReactNode,
} from "react";
import { useFetcher } from "react-router";

import type { AttributeFieldMeta } from "../generated/field_meta";
import { attribute_display_label } from "./columns";
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
  list_path: string;
  can_create: boolean;
  attributes: readonly AttributeFieldMeta[];
  baseline_predicate: SearchPredicate | null;
  /** Latest search result from loader or prior action. */
  search: ListSearchPayload;
  on_search_result: (result: ListSearchPayload) => void;
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
 */
export function ListContextBar({
  class_display_name,
  collection,
  list_path,
  can_create,
  attributes,
  baseline_predicate,
  search,
  on_search_result,
}: ListContextBarProps) {
  const fetcher = useFetcher<ListSearchPayload>();
  const filterable = useMemo(
    () => quick_filterable_attributes(attributes),
    [attributes],
  );
  const [selected_name, set_selected_name] = useState(
    () => filterable[0]?.name_snake ?? "",
  );
  const selected =
    filterable.find((attr) => attr.name_snake === selected_name) ??
    filterable[0] ??
    null;
  const [values, set_values] = useState<QuickFilterValues>({});
  const [warning, set_warning] = useState<string | null>(null);
  const [menu_open, set_menu_open] = useState(false);
  const [copied, set_copied] = useState(false);
  const menu_id = useId();
  const effective_ref = useRef<SearchPredicate | null>(
    search.effective_predicate ?? baseline_predicate,
  );

  useEffect(() => {
    effective_ref.current =
      search.effective_predicate ?? baseline_predicate;
  }, [search.effective_predicate, baseline_predicate]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data != null) {
      effective_ref.current = fetcher.data.effective_predicate;
      on_search_result(fetcher.data);
    }
  }, [fetcher.state, fetcher.data, on_search_result]);

  useEffect(() => {
    set_values({});
    set_warning(null);
  }, [selected_name]);

  function submit_predicate(predicate: SearchPredicate | null) {
    const form = new FormData();
    form.set(
      "predicate",
      predicate == null ? "null" : JSON.stringify(predicate),
    );
    void fetcher.submit(form, { method: "post" });
  }

  function on_refresh() {
    set_warning(null);
    submit_predicate(effective_ref.current);
  }

  function on_quick_filter_enter() {
    if (selected == null) {
      return;
    }
    const built = build_quick_filter_predicates(selected, values);
    if (!built.ok) {
      set_warning(built.warning);
      return;
    }
    if (built.predicates.length === 0) {
      set_warning(null);
      return;
    }
    set_warning(null);
    const next = and_predicates(effective_ref.current, ...built.predicates);
    submit_predicate(next);
  }

  async function on_copy_link() {
    const absolute = new URL(list_path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absolute);
      set_copied(true);
      window.setTimeout(() => set_copied(false), 1500);
    } catch {
      set_warning("Could not copy link.");
    }
  }

  const kind =
    selected == null ? null : quick_filter_control_kind(selected.type_name);
  const busy = fetcher.state !== "idle";

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
              onChange={(event) => set_selected_name(event.target.value)}
            >
              {filterable.map((attr) => (
                <option key={attr.name_snake} value={attr.name_snake}>
                  {attribute_display_label(attr.name_kebab)}
                </option>
              ))}
            </select>
            <QuickFilterControls
              kind={kind}
              values={values}
              set_values={set_values}
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
  on_enter,
}: {
  kind: NonNullable<ReturnType<typeof quick_filter_control_kind>>;
  values: QuickFilterValues;
  set_values: (next: QuickFilterValues) => void;
  on_enter: () => void;
}) {
  function on_key_down(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      on_enter();
    }
  }

  if (kind === "text" || kind === "friendly-id") {
    return (
      <input
        type="text"
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

  const input_type = kind === "datetime" ? "datetime-local" : "text";
  const input_mode = kind === "numeric" ? "decimal" : undefined;

  return (
    <div className="flex items-center gap-1">
      <label className="flex items-center gap-1 text-[var(--color-shell-chrome-muted)]">
        From:
        <input
          type={input_type}
          inputMode={input_mode}
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
          type={input_type}
          inputMode={input_mode}
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
