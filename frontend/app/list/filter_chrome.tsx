/**
 * List filter row + nested filter editor (#77).
 */
import {
  Funnel,
  Minimize2,
  Play,
  Plus,
  RotateCcw,
  SquareX,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import type { AttributeFieldMeta } from "../generated/field_meta";
import { attribute_display_label } from "./columns";
import {
  append_group_child,
  apply_operator_change,
  commit_editor_root,
  editor_filterable_attributes,
  eligible_ops_for_row,
  empty_leaf,
  load_editor_from_predicate,
  op_requires_value,
  operator_display_name,
  remove_editor_node,
  update_editor_node,
  type EditorLeaf,
  type EditorNode,
} from "./filter_ops";
import { render_predicate_text } from "./predicate_text";
import {
  apply_datetime_date_change,
  apply_datetime_time_change,
  DATETIME_FROM_DEFAULT_TIME,
  quick_filter_control_kind,
  split_datetime_local,
  type SearchPredicate,
} from "./quick_filter";

export type ListFilterChromeProps = {
  attributes: readonly AttributeFieldMeta[];
  effective_predicate: SearchPredicate | null;
  busy: boolean;
  on_execute: (predicate: SearchPredicate | null) => void;
  on_warning: (warning: string | null) => void;
};

/**
 * Filter row (funnel + clipped text) and expandable nested editor.
 */
export function ListFilterChrome({
  attributes,
  effective_predicate,
  busy,
  on_execute,
  on_warning,
}: ListFilterChromeProps) {
  const [open, set_open] = useState(false);
  const [draft, set_draft] = useState<EditorNode | null>(null);
  const [blocked_not, set_blocked_not] = useState(false);
  const [editor_warning, set_editor_warning] = useState<string | null>(null);
  const panel_id = useId();

  const filterable = useMemo(
    () => editor_filterable_attributes(attributes),
    [attributes],
  );

  const filter_text = useMemo(
    () => render_predicate_text(effective_predicate, attributes),
    [effective_predicate, attributes],
  );

  function sync_draft_from_effective() {
    const loaded = load_editor_from_predicate(effective_predicate);
    if (!loaded.ok) {
      set_blocked_not(true);
      set_draft(null);
      set_editor_warning(
        "This filter uses a Not condition and cannot be edited in this UI. Reset or Close, or clear the filter another way.",
      );
      return;
    }
    set_blocked_not(false);
    set_draft(loaded.root);
    set_editor_warning(null);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    sync_draft_from_effective();
    // Re-sync when effective filter changes while editor is open (e.g. quick filter).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on open + effective
  }, [open, effective_predicate]);

  function on_toggle() {
    if (open) {
      set_open(false);
      set_editor_warning(null);
      return;
    }
    set_open(true);
  }

  function on_close() {
    set_open(false);
    set_editor_warning(null);
    on_warning(null);
  }

  function on_reset() {
    sync_draft_from_effective();
    on_warning(null);
  }

  function on_add_root() {
    if (draft != null || blocked_not) {
      return;
    }
    set_draft(empty_leaf());
    set_editor_warning(null);
  }

  function on_execute_click() {
    if (blocked_not) {
      set_editor_warning(
        "This filter uses a Not condition and cannot be edited in this UI.",
      );
      return;
    }
    const committed = commit_editor_root(draft);
    if (!committed.ok) {
      set_editor_warning(committed.message);
      return;
    }
    set_editor_warning(null);
    on_warning(null);
    on_execute(committed.predicate);
    set_open(false);
  }

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50">
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-700 hover:bg-slate-200"
          aria-label="Filter"
          title="Filter"
          aria-expanded={open}
          aria-controls={panel_id}
          onClick={on_toggle}
        >
          <Funnel className="h-4 w-4" aria-hidden />
        </button>
        <div
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-slate-800"
          title={filter_text || undefined}
        >
          {filter_text}
        </div>
      </div>

      {open ? (
        <div
          id={panel_id}
          className="border-t border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {blocked_not ? (
            <p className="mb-2 text-amber-800" role="status">
              {editor_warning}
            </p>
          ) : (
            <>
              {draft != null ? (
                <EditorTree
                  root={draft}
                  filterable={filterable}
                  on_change={set_draft}
                />
              ) : (
                <p className="mb-2 text-slate-500">No filter (match all).</p>
              )}
              {editor_warning != null ? (
                <p className="mb-2 text-amber-800" role="status">
                  {editor_warning}
                </p>
              ) : null}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <EditorActionButton
              label="Execute"
              disabled={busy || blocked_not}
              on_click={on_execute_click}
              icon={<Play className="h-4 w-4" aria-hidden />}
            />
            <EditorActionButton
              label="Add"
              disabled={busy || blocked_not || draft != null}
              on_click={on_add_root}
              icon={<Plus className="h-4 w-4" aria-hidden />}
            />
            <EditorActionButton
              label="Reset"
              disabled={busy}
              on_click={on_reset}
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            />
            <EditorActionButton
              label="Close"
              disabled={busy}
              on_click={on_close}
              icon={<Minimize2 className="h-4 w-4" aria-hidden />}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditorActionButton({
  label,
  icon,
  disabled,
  on_click,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  on_click: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={on_click}
      aria-label={label}
    >
      {icon}
      {label}
    </button>
  );
}

function EditorTree({
  root,
  filterable,
  on_change,
}: {
  root: EditorNode;
  filterable: AttributeFieldMeta[];
  on_change: (next: EditorNode | null) => void;
}) {
  return (
    <div className="mb-2 space-y-1">
      <EditorNodeRow
        node={root}
        depth={0}
        parent_op={null}
        filterable={filterable}
        root={root}
        on_root_change={on_change}
      />
    </div>
  );
}

function EditorNodeRow({
  node,
  depth,
  parent_op,
  filterable,
  root,
  on_root_change,
}: {
  node: EditorNode;
  depth: number;
  parent_op: "and" | "or" | null;
  filterable: AttributeFieldMeta[];
  root: EditorNode;
  on_root_change: (next: EditorNode | null) => void;
}) {
  const indent = depth * 2; // rem via padding — remove control width ~2rem

  function replace(next: EditorNode) {
    on_root_change(update_editor_node(root, node.id, () => next));
  }

  function remove() {
    on_root_change(remove_editor_node(root, node.id));
  }

  if (node.kind === "group") {
    return (
      <div className="space-y-1">
        <div
          className="flex flex-wrap items-center gap-1"
          style={{ paddingLeft: `${indent}rem` }}
        >
          <RemoveButton on_click={remove} />
          <OperatorSelect
            node={node}
            parent_op={parent_op}
            attribute_type={null}
            on_change={(op) => replace(apply_operator_change(node, op))}
          />
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
            aria-label="Add condition"
            title="Add condition"
            onClick={() => on_root_change(append_group_child(root, node.id))}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {node.children.map((child) => (
          <EditorNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            parent_op={node.op}
            filterable={filterable}
            root={root}
            on_root_change={on_root_change}
          />
        ))}
      </div>
    );
  }

  return (
    <LeafRow
      node={node}
      depth={depth}
      parent_op={parent_op}
      filterable={filterable}
      on_replace={replace}
      on_remove={remove}
    />
  );
}

function LeafRow({
  node,
  depth,
  parent_op,
  filterable,
  on_replace,
  on_remove,
}: {
  node: EditorLeaf;
  depth: number;
  parent_op: "and" | "or" | null;
  filterable: AttributeFieldMeta[];
  on_replace: (next: EditorNode) => void;
  on_remove: () => void;
}) {
  const selected =
    filterable.find((attr) => attr.name_snake === node.attribute) ?? null;
  const type_name = selected?.type_name ?? null;

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      style={{ paddingLeft: `${depth * 2}rem` }}
    >
      <RemoveButton on_click={on_remove} />
      <label className="sr-only" htmlFor={`field-${node.id}`}>
        Field
      </label>
      <select
        id={`field-${node.id}`}
        className="h-7 max-w-48 rounded border border-slate-300 bg-white px-1"
        value={node.attribute ?? ""}
        onChange={(event) => {
          const name = event.target.value;
          const next_attr =
            filterable.find((attr) => attr.name_snake === name) ?? null;
          const prev_type = type_name;
          const next_type = next_attr?.type_name ?? null;
          const clear_value = prev_type !== next_type;
          on_replace({
            ...node,
            attribute: name === "" ? null : name,
            value: clear_value ? undefined : node.value,
            op:
              next_type != null &&
              node.op != null &&
              !eligible_ops_for_row({
                node: { ...node, attribute: name },
                parent_op,
                attribute_type: next_type,
              }).includes(node.op)
                ? null
                : node.op,
          });
        }}
      >
        <option value="">Field…</option>
        {filterable.map((attr) => (
          <option key={attr.name_snake} value={attr.name_snake}>
            {attribute_display_label(attr.name_kebab)}
          </option>
        ))}
      </select>
      <OperatorSelect
        node={node}
        parent_op={parent_op}
        attribute_type={type_name}
        on_change={(op) => on_replace(apply_operator_change(node, op))}
      />
      {node.op != null && op_requires_value(node.op) && type_name != null ? (
        <ValueControl
          type_name={type_name}
          value={node.value}
          on_change={(value) => on_replace({ ...node, value })}
        />
      ) : null}
    </div>
  );
}

function OperatorSelect({
  node,
  parent_op,
  attribute_type,
  on_change,
}: {
  node: EditorNode;
  parent_op: "and" | "or" | null;
  attribute_type: string | null;
  on_change: (op: string) => void;
}) {
  const ops = eligible_ops_for_row({ node, parent_op, attribute_type });
  const current =
    node.kind === "group" ? node.op : (node.op ?? "");
  return (
    <>
      <label className="sr-only" htmlFor={`op-${node.id}`}>
        Operator
      </label>
      <select
        id={`op-${node.id}`}
        className="h-7 max-w-52 rounded border border-slate-300 bg-white px-1"
        value={current}
        onChange={(event) => {
          const op = event.target.value;
          if (op !== "") {
            on_change(op);
          }
        }}
      >
        {node.kind === "leaf" && node.op == null ? (
          <option value="">Operator…</option>
        ) : null}
        {ops.map((op) => (
          <option key={op} value={op}>
            {operator_display_name(op)}
          </option>
        ))}
      </select>
    </>
  );
}

function RemoveButton({ on_click }: { on_click: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-700 hover:bg-slate-100"
      aria-label="Remove"
      title="Remove"
      onClick={on_click}
    >
      <SquareX className="h-4 w-4" aria-hidden />
    </button>
  );
}

function ValueControl({
  type_name,
  value,
  on_change,
}: {
  type_name: string;
  value: unknown;
  on_change: (value: unknown) => void;
}) {
  const kind = quick_filter_control_kind(type_name);
  const field_class =
    "h-7 rounded border border-slate-300 bg-white px-1 text-slate-900";

  if (kind === "boolean") {
    const checked = value === true;
    return (
      <label className="inline-flex items-center gap-1 px-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => on_change(event.target.checked)}
        />
        true
      </label>
    );
  }

  if (kind === "numeric") {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`${field_class} w-28`}
        aria-label="Value"
        value={value == null ? "" : String(value)}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") {
            on_change(undefined);
            return;
          }
          if (/^-?\d+(\.\d+)?$/.test(raw)) {
            on_change(Number(raw));
            return;
          }
          on_change(raw);
        }}
      />
    );
  }

  if (kind === "datetime") {
    const as_string = typeof value === "string" ? value : "";
    // Store local combined in the control; commit path converts via Date → ISO.
    const local = iso_to_local_combined(as_string);
    const parts = split_datetime_local(local);
    return (
      <div className="flex flex-wrap items-center gap-1">
        <input
          type="date"
          lang="en-GB"
          autoComplete="off"
          className={`${field_class} w-[9.5rem]`}
          aria-label="Date"
          value={parts.date}
          onChange={(event) => {
            const combined = apply_datetime_date_change(
              "from",
              event.target.value,
              local,
            );
            on_change(local_combined_to_iso(combined));
          }}
        />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:mm:ss"
          className={`${field_class} w-24 font-mono`}
          aria-label="Time"
          value={parts.time}
          onChange={(event) => {
            const next = apply_datetime_time_change(
              event.target.value,
              local,
              DATETIME_FROM_DEFAULT_TIME,
            );
            if (next.ok) {
              on_change(local_combined_to_iso(next.combined));
            }
          }}
        />
      </div>
    );
  }

  return (
    <input
      type="text"
      autoComplete="off"
      className={`${field_class} w-40`}
      aria-label="Value"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(event) => on_change(event.target.value)}
    />
  );
}

function iso_to_local_combined(iso: string): string {
  if (iso === "") {
    return "";
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    // Already local-ish
    return iso.includes("T") ? iso : iso.replace(" ", "T");
  }
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function local_combined_to_iso(combined: string): string | undefined {
  if (combined.trim() === "") {
    return undefined;
  }
  const ms = Date.parse(combined);
  if (Number.isNaN(ms)) {
    return combined;
  }
  return new Date(ms).toISOString();
}
