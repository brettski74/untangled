import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  can_go_next,
  can_go_prev,
  clamp_starting_record,
  digits_only,
  is_per_page_option,
  last_page_start,
  offset_from_start,
  PER_PAGE_OPTIONS,
  per_page_change_needs_refresh,
  start_from_offset,
} from "./pagination";

export type ListPaginationProps = {
  total: number;
  limit: number;
  offset: number;
  busy: boolean;
  /**
   * Apply a new page window via the SSR search seam.
   * When ``search`` is false, only update local limit (visible window unchanged).
   */
  on_paging_change: (next: {
    limit: number;
    offset: number;
    search: boolean;
  }) => void;
};

/**
 * Dense list footer: per-page select (left) + offset-style pager (right).
 */
export function ListPagination({
  total,
  limit,
  offset,
  busy,
  on_paging_change,
}: ListPaginationProps) {
  const start = start_from_offset(offset);
  const [draft_start, set_draft_start] = useState(String(start));
  const start_id = useId();
  const per_page_id = useId();

  useEffect(() => {
    set_draft_start(String(start_from_offset(offset)));
  }, [offset, limit, total]);

  const prev_enabled = !busy && can_go_prev(start);
  const next_enabled = !busy && can_go_next(start, total, limit);

  function commit_start(raw: string) {
    const next_start = clamp_starting_record(raw, total, limit);
    set_draft_start(String(next_start));
    const next_offset = offset_from_start(next_start);
    if (next_offset === offset) {
      return;
    }
    on_paging_change({ limit, offset: next_offset, search: true });
  }

  function on_start_key_down(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commit_start(draft_start);
  }

  function on_start_change(event: ChangeEvent<HTMLInputElement>) {
    set_draft_start(digits_only(event.target.value));
  }

  function on_per_page_change(event: ChangeEvent<HTMLSelectElement>) {
    const next_limit = Number.parseInt(event.target.value, 10);
    if (!is_per_page_option(next_limit) || next_limit === limit) {
      return;
    }
    const needs_search = per_page_change_needs_refresh(
      start,
      total,
      limit,
      next_limit,
    );
    on_paging_change({
      limit: next_limit,
      offset,
      search: needs_search,
    });
  }

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
      data-testid="list-pagination"
    >
      <div className="flex items-center gap-1.5">
        <select
          id={per_page_id}
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs disabled:opacity-50"
          value={limit}
          disabled={busy}
          aria-label="Rows per page"
          onChange={on_per_page_change}
        >
          {PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label htmlFor={per_page_id} className="text-slate-600">
          per page
        </label>
      </div>

      <div className="flex items-center gap-1">
        <PagerButton
          label="First page"
          disabled={!prev_enabled}
          onClick={() =>
            on_paging_change({ limit, offset: 0, search: true })
          }
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </PagerButton>
        <PagerButton
          label="Previous page"
          disabled={!prev_enabled}
          onClick={() => {
            const next = Math.max(1, start - limit);
            on_paging_change({
              limit,
              offset: offset_from_start(next),
              search: true,
            });
          }}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PagerButton>

        <label htmlFor={start_id} className="sr-only">
          Starting record
        </label>
        <input
          id={start_id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="w-14 rounded border border-slate-300 bg-white px-1.5 py-1 text-center text-xs disabled:opacity-50"
          value={draft_start}
          disabled={busy}
          aria-label="Starting record"
          onChange={on_start_change}
          onKeyDown={on_start_key_down}
          onBlur={() => set_draft_start(String(start))}
        />
        <span className="px-0.5 text-slate-500" aria-hidden="true">
          /
        </span>
        <span className="min-w-[2rem] text-slate-700" aria-label="Total records">
          {total}
        </span>

        <PagerButton
          label="Next page"
          disabled={!next_enabled}
          onClick={() => {
            on_paging_change({
              limit,
              offset: offset_from_start(start + limit),
              search: true,
            });
          }}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PagerButton>
        <PagerButton
          label="Last page"
          disabled={!next_enabled}
          onClick={() => {
            on_paging_change({
              limit,
              offset: offset_from_start(last_page_start(total, limit)),
              search: true,
            });
          }}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </PagerButton>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex rounded p-1 text-slate-700 hover:bg-slate-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
