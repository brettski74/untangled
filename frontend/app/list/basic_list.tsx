import { collection_for_class } from "../shell/nav_paths";
import { record_detail_path } from "../records/record_paths";
import {
  column_width_px,
  type ListColumn,
} from "./columns";

export type BasicListProps = {
  collection: string;
  columns: ListColumn[];
  rows: Record<string, unknown>[];
};

/**
 * Schema-driven dense list: static headers, clipped cells, real record anchors.
 */
export function BasicList({
  collection,
  columns,
  rows,
}: BasicListProps) {
  const empty = rows.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse text-left text-sm text-slate-900">
          <thead>
            <tr className="bg-slate-200/80">
              {columns.map((column) => (
                <th
                  key={column.name_snake}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-slate-300 px-2 py-1.5 font-semibold whitespace-nowrap"
                  style={{
                    width: column_width_px(column.type_name),
                    minWidth: column_width_px(column.type_name),
                    maxWidth: column_width_px(column.type_name),
                  }}
                >
                  {column.label}
                </th>
              ))}
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
                      style={{
                        width: column_width_px(column.type_name),
                        minWidth: column_width_px(column.type_name),
                        maxWidth: column_width_px(column.type_name),
                      }}
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
