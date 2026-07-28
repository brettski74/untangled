import {
  ArrowDownAZ,
  ArrowDownZA,
  GripVertical,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { collection_for_class } from "../shell/nav_paths";
import { record_detail_path } from "../records/record_paths";
import {
  clamp_column_width,
  insert_before_index_for_client_x,
  width_for_attribute,
} from "./column_layout";
import type { ListColumn } from "./columns";
import {
  sort_accessible_label,
  type ListSortSpec,
} from "./header_sort";

export type BasicListProps = {
  collection: string;
  columns: ListColumn[];
  widths: Readonly<Record<string, number>>;
  sort: readonly ListSortSpec[];
  rows: Record<string, unknown>[];
  on_sort_click: (attribute: string) => void;
  on_reorder: (from_index: number, to_index: number) => void;
  on_resize_commit: (attribute: string, width_px: number) => void;
};

/**
 * Schema-driven dense list: interactive headers (reorder / resize / sort),
 * clipped cells, real record anchors.
 */
export function BasicList({
  collection,
  columns,
  widths,
  sort,
  rows,
  on_sort_click,
  on_reorder,
  on_resize_commit,
}: BasicListProps) {
  const empty = rows.length === 0;
  const table_ref = useRef<HTMLTableElement | null>(null);
  const live_widths_ref = useRef<Record<string, number>>({});
  const drag_from_ref = useRef<number | null>(null);
  const drop_index_ref = useRef<number | null>(null);
  const resize_ref = useRef<{
    attribute: string;
    start_x: number;
    start_width: number;
  } | null>(null);

  useEffect(() => {
    live_widths_ref.current = {};
    for (const column of columns) {
      live_widths_ref.current[column.name_snake] = width_for_attribute(
        widths,
        column.name_snake,
        column.type_name,
      );
    }
    apply_colgroup_widths(table_ref.current, columns, live_widths_ref.current);
    // Column set changed — abandon in-flight pointer gestures (React state wins).
    resize_ref.current = null;
    drag_from_ref.current = null;
    drop_index_ref.current = null;
    clear_drop_markers(table_ref.current);
  }, [columns, widths]);

  function commit_resize(attribute: string) {
    const width = live_widths_ref.current[attribute];
    if (typeof width === "number") {
      on_resize_commit(attribute, clamp_column_width(width));
    }
  }

  function on_resize_pointer_down(
    event: ReactPointerEvent<HTMLDivElement>,
    attribute: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const start_width = width_for_attribute(
      widths,
      attribute,
      columns.find((column) => column.name_snake === attribute)?.type_name ??
        "text",
    );
    resize_ref.current = {
      attribute,
      start_x: event.clientX,
      start_width,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function on_resize_pointer_move(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resize_ref.current;
    if (drag == null) {
      return;
    }
    const next = clamp_column_width(
      drag.start_width + (event.clientX - drag.start_x),
    );
    live_widths_ref.current[drag.attribute] = next;
    apply_colgroup_widths(table_ref.current, columns, live_widths_ref.current);
  }

  function on_resize_pointer_end(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resize_ref.current;
    if (drag == null) {
      return;
    }
    resize_ref.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(
        event.pointerId,
      );
    } catch {
      // already released
    }
    commit_resize(drag.attribute);
  }

  function on_grip_pointer_down(
    event: ReactPointerEvent<HTMLSpanElement>,
    index: number,
  ) {
    event.preventDefault();
    drag_from_ref.current = index;
    drop_index_ref.current = index;
    paint_drop_marker(table_ref.current, index);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function on_grip_pointer_move(event: ReactPointerEvent<HTMLSpanElement>) {
    const from = drag_from_ref.current;
    if (from == null || table_ref.current == null) {
      return;
    }
    const headers = table_ref.current.querySelectorAll("thead th");
    const rects = [...headers].map((header) => {
      const rect = header.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });
    const next_drop = insert_before_index_for_client_x(rects, event.clientX);
    drop_index_ref.current = next_drop;
    paint_drop_marker(table_ref.current, next_drop);
  }

  function on_grip_pointer_end(event: ReactPointerEvent<HTMLSpanElement>) {
    const from = drag_from_ref.current;
    if (from == null) {
      return;
    }
    const to = drop_index_ref.current ?? from;
    drag_from_ref.current = null;
    drop_index_ref.current = null;
    clear_drop_markers(table_ref.current);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(
        event.pointerId,
      );
    } catch {
      // already released
    }
    if (to !== from && to !== from + 1) {
      on_reorder(from, to);
    }
  }

  const primary = sort[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          ref={table_ref}
          className="table-fixed border-collapse text-left text-sm text-slate-900"
        >
          <colgroup>
            {columns.map((column) => {
              const width = width_for_attribute(
                widths,
                column.name_snake,
                column.type_name,
              );
              return (
                <col
                  key={column.name_snake}
                  data-attribute={column.name_snake}
                  style={{ width: `${width}px` }}
                />
              );
            })}
          </colgroup>
          <thead>
            <tr className="bg-slate-200/80">
              {columns.map((column, index) => {
                const sort_label = sort_accessible_label(
                  sort,
                  column.name_snake,
                );
                const is_primary =
                  primary != null && primary.attribute === column.name_snake;
                return (
                  <th
                    key={column.name_snake}
                    scope="col"
                    data-col-index={index}
                    aria-sort={
                      is_primary
                        ? primary.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className="sticky top-0 z-10 overflow-hidden border-b border-slate-300 px-1 py-1.5 font-semibold whitespace-nowrap"
                  >
                    <div className="relative flex min-w-0 items-center gap-0.5 pr-2">
                      <span
                        className="inline-flex shrink-0 cursor-grab touch-none rounded p-0.5 text-slate-500 hover:bg-slate-300/60 hover:text-slate-800 active:cursor-grabbing"
                        aria-hidden="true"
                        title={`Reorder ${column.label}`}
                        onPointerDown={(event) =>
                          on_grip_pointer_down(event, index)
                        }
                        onPointerMove={on_grip_pointer_move}
                        onPointerUp={on_grip_pointer_end}
                        onPointerCancel={on_grip_pointer_end}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        className="inline-flex min-w-0 flex-1 items-center gap-1 truncate rounded px-0.5 text-left hover:bg-slate-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600"
                        onClick={() => on_sort_click(column.name_snake)}
                        aria-label={
                          sort_label == null
                            ? `Sort by ${column.label}`
                            : `${column.label}, ${sort_label}`
                        }
                        title={
                          sort_label == null
                            ? `Sort by ${column.label}`
                            : `${column.label} (${sort_label})`
                        }
                      >
                        <span className="truncate">{column.label}</span>
                        {is_primary ? (
                          primary.direction === "asc" ? (
                            <ArrowDownAZ
                              className="h-4 w-4 shrink-0 text-slate-700"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDownZA
                              className="h-4 w-4 shrink-0 text-slate-700"
                              aria-hidden="true"
                            />
                          )
                        ) : null}
                      </button>
                      <div
                        role="presentation"
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-slate-400/50"
                        onPointerDown={(event) =>
                          on_resize_pointer_down(event, column.name_snake)
                        }
                        onPointerMove={on_resize_pointer_move}
                        onPointerUp={on_resize_pointer_end}
                        onPointerCancel={on_resize_pointer_end}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-3 py-8 text-slate-600"
                >
                  No records match this list.
                </td>
              </tr>
            ) : (
              rows.map((row, row_index) => (
                <tr
                  key={row_key(row, row_index)}
                  className="border-b border-slate-200 bg-white hover:bg-slate-100"
                >
                  {columns.map((column) => (
                    <td
                      key={column.name_snake}
                      className="overflow-hidden px-2 py-1 text-left text-ellipsis whitespace-nowrap"
                      title={cell_title(row[column.name_snake])}
                    >
                      <ListCell
                        collection={collection}
                        column={column}
                        value={row[column.name_snake]}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DROP_MARKER_CLASS = "ring-inset ring-1 ring-sky-500";
const DROP_MARKER_END_CLASS = "shadow-[inset_-2px_0_0_0_rgb(14_165_233)]";

function paint_drop_marker(
  table: HTMLTableElement | null,
  insert_before_index: number,
) {
  if (table == null) {
    return;
  }
  clear_drop_markers(table);
  const headers = table.querySelectorAll("thead th");
  if (headers.length === 0) {
    return;
  }
  if (insert_before_index >= headers.length) {
    headers[headers.length - 1]?.classList.add(DROP_MARKER_END_CLASS);
    return;
  }
  headers[insert_before_index]?.classList.add(...DROP_MARKER_CLASS.split(" "));
}

function clear_drop_markers(table: HTMLTableElement | null) {
  if (table == null) {
    return;
  }
  for (const header of table.querySelectorAll("thead th")) {
    header.classList.remove(...DROP_MARKER_CLASS.split(" "));
    header.classList.remove(DROP_MARKER_END_CLASS);
  }
}

function apply_colgroup_widths(
  table: HTMLTableElement | null,
  columns: readonly ListColumn[],
  live_widths: Readonly<Record<string, number>>,
) {
  if (table == null) {
    return;
  }
  for (const column of columns) {
    const width = live_widths[column.name_snake];
    if (typeof width !== "number") {
      continue;
    }
    const col = table.querySelector(
      `colgroup col[data-attribute="${CSS.escape(column.name_snake)}"]`,
    ) as HTMLTableColElement | null;
    if (col != null) {
      col.style.width = `${width}px`;
    }
  }
}

function ListCell({
  collection,
  column,
  value,
}: {
  collection: string;
  column: ListColumn;
  value: unknown;
}) {
  if (value == null || value === "") {
    return null;
  }

  const text = format_cell_value(value);

  if (column.is_friendly_id && typeof value === "string") {
    return (
      <a
        className="text-sky-800 underline underline-offset-2"
        href={record_detail_path(collection, value)}
      >
        {text}
      </a>
    );
  }

  if (
    column.type_name === "uuid" &&
    column.references != null &&
    typeof value === "string"
  ) {
    const target_collection = collection_for_class(column.references);
    if (target_collection != null) {
      return (
        <a
          className="text-sky-800 underline underline-offset-2"
          href={record_detail_path(target_collection, value)}
        >
          {text}
        </a>
      );
    }
  }

  return <>{text}</>;
}

function format_cell_value(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value);
}

function cell_title(value: unknown): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return format_cell_value(value);
}

function row_key(row: Record<string, unknown>, index: number): string {
  const id = row.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  return `row-${index}`;
}
