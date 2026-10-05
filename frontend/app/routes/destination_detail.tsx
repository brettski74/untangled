import { useEffect, useMemo, useRef, useState } from "react";
import { data, useOutletContext, useRevalidator } from "react-router";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  DOCUMENT_BOOTSTRAP,
  forbidden_response,
  redirect_unauthorized,
  require_document_access,
} from "../auth/gate.server";
import { DetailContextBar } from "../detail/detail_context_bar";
import {
  apply_field_edit,
  close_active_chunk,
  compute_changed_fields,
  create_editor_snapshot,
  editable_field_names,
  is_dirty,
  reset_editor_from_record,
  undo_last_chunk,
  type EditorSnapshot,
} from "../detail/detail_editor";
import { commit_active_editor_field } from "../detail/commit_active_editor_field";
import { DetailForm } from "../detail/detail_form";
import { partition_detail_layout } from "../detail/default_layout";
import { use_record_editor_undo } from "../detail/use_record_editor_undo";
import { class_field_meta } from "../generated/field_meta";
import { update_record } from "../records/browser_api";
import { fetch_record } from "../records/fetch.server";
import { prepare_update_body } from "../records/mutation_body";
import { record_detail_path } from "../records/record_paths";
import { can_update_class } from "../shell/nav_filter";
import { ShellContextBar } from "../shell/shell_context_bar";
import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/destination_detail";

export type DetailLoaderData = {
  class_name: string;
  class_display_name: string;
  locator: string;
  title_token: string;
  copy_path: string;
  record: Record<string, unknown>;
  layout: ReturnType<typeof partition_detail_layout>;
};

export function meta({ loaderData: loader_data }: Route.MetaArgs) {
  if (loader_data == null) {
    return [{ title: "Untangled" }];
  }
  return [
    {
      title: `${loader_data.class_display_name} ${loader_data.title_token} — Untangled`,
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const class_name = params.class_name;
  const locator = params.locator;
  if (class_name == null || locator == null || locator === "") {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved path segments are registered as static routes; still fail closed.
  if (locator === "new" || locator === "lists") {
    throw new Response("Not Found", { status: 404 });
  }

  const meta = class_field_meta(class_name);
  if (meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved query: ignore unknown view=; always default layout in M1.
  void new URL(request.url).searchParams.get("view");

  const access_token = await require_document_access(request);
  if (access_token === DOCUMENT_BOOTSTRAP) {
    return data(null, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const record = await fetch_record(access_token, class_name, locator);
    const layout = partition_detail_layout(meta);
    const title_token = detail_title_token(meta.friendly_id_attr, record);
    const preferred_locator =
      meta.friendly_id_attr != null &&
      typeof record[meta.friendly_id_attr] === "string" &&
      (record[meta.friendly_id_attr] as string).length > 0
        ? (record[meta.friendly_id_attr] as string)
        : typeof record.id === "string"
          ? record.id
          : locator;

    return data({
      class_name,
      class_display_name: meta.display_name,
      locator,
      title_token,
      copy_path: record_detail_path(class_name, preferred_locator),
      record,
      layout,
    } satisfies DetailLoaderData);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (error instanceof ApiUnauthorizedError) {
      throw await redirect_unauthorized(request);
    }
    if (error instanceof ApiForbiddenError) {
      throw forbidden_response();
    }
    throw error;
  }
}

export default function DestinationDetailPage({
  loaderData,
}: Route.ComponentProps) {
  if (loaderData == null) {
    return null;
  }
  const loaded = loaderData;
  const { me } = useOutletContext<AuthenticatedOutletContext>();
  const can_update = can_update_class(me.permissions, loaded.class_name);
  const editable = useMemo(
    () => editable_field_names(loaded.layout),
    [loaded.layout],
  );

  const [editor, set_editor] = useState<EditorSnapshot>(() =>
    create_editor_snapshot(loaded.record, editable),
  );
  const [display_record, set_display_record] = useState<Record<string, unknown>>(
    loaded.record,
  );
  const [save_error, set_save_error] = useState<string | null>(null);
  const [save_pending, set_save_pending] = useState(false);
  const [pending_refresh, set_pending_refresh] = useState(false);

  const form_ref = useRef<HTMLDivElement>(null);
  const editor_ref = useRef(editor);
  editor_ref.current = editor;
  const revalidator = useRevalidator();

  const dirty = is_dirty(editor.baseline, editor.draft, editable);
  const save_enabled = can_update && dirty;

  // Explicit refresh: discard dirty immediately from last known loader record,
  // then apply freshest loader data when revalidation idles. Incidental
  // revalidation while dirty (pending_refresh false) never resets.
  useEffect(() => {
    if (!pending_refresh || revalidator.state !== "idle") {
      return;
    }
    set_display_record(loaded.record);
    set_editor(reset_editor_from_record(loaded.record, editable));
    set_save_error(null);
    set_pending_refresh(false);
  }, [
    pending_refresh,
    revalidator.state,
    loaded.record,
    editable,
  ]);

  use_record_editor_undo(
    form_ref,
    can_update,
    () => set_editor((snap) => undo_last_chunk(snap)),
    () => set_editor((snap) => close_active_chunk(snap)),
  );

  // Ctrl/Cmd+S is deliberately page-level (Save is a record command), unlike
  // Ctrl+Z which stays form-subtree-scoped so shell chrome keeps native undo.
  // Registered only when can_update; removed on unmount / permission loss.
  useEffect(() => {
    if (!can_update) {
      return;
    }
    function on_keydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      activate_save_ref.current();
    }
    window.addEventListener("keydown", on_keydown);
    return () => window.removeEventListener("keydown", on_keydown);
  }, [can_update]);

  const activate_save_ref = useRef(() => {});
  activate_save_ref.current = () => {
    if (!can_update || save_pending) {
      return;
    }
    // Time24Field commits on blur; flush before dirty/changed computation.
    commit_active_editor_field(form_ref.current);
    const snap = editor_ref.current;
    if (!is_dirty(snap.baseline, snap.draft, editable)) {
      return;
    }
    const changed = compute_changed_fields(
      snap.baseline,
      snap.draft,
      editable,
    );
    if (Object.keys(changed).length === 0) {
      return;
    }
    const prepared = prepare_update_body(loaded.class_name, changed);
    if (!prepared.ok) {
      set_save_error(prepared.detail);
      return;
    }
    set_save_error(null);
    set_save_pending(true);
    void update_record(loaded.class_name, loaded.locator, prepared.body).then(
      (result) => {
        set_save_pending(false);
        if (!result.ok) {
          set_save_error(result.detail);
          return;
        }
        set_display_record(result.record);
        set_editor(reset_editor_from_record(result.record, editable));
        set_save_error(null);
      },
    );
  };

  function on_refresh() {
    // Discard dirty immediately (user asked to reload); then revalidate.
    set_editor(reset_editor_from_record(loaded.record, editable));
    set_display_record(loaded.record);
    set_save_error(null);
    set_pending_refresh(true);
    revalidator.revalidate();
  }

  // Merge draft into display for form: RO fields from display_record.
  const form_record = display_record;

  return (
    <>
      <ShellContextBar>
        <DetailContextBar
          class_display_name={loaded.class_display_name}
          title_token={loaded.title_token}
          copy_url={loaded.copy_path}
          dirty={dirty}
          save_enabled={save_enabled}
          save_pending={save_pending}
          on_save={() => activate_save_ref.current()}
          on_refresh={on_refresh}
          refresh_pending={pending_refresh || revalidator.state === "loading"}
        />
      </ShellContextBar>

      {save_error != null ? (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-start justify-between gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          <span>{save_error}</span>
          <button
            type="button"
            className="shrink-0 rounded px-2 py-0.5 text-red-800 hover:bg-red-100"
            onClick={() => set_save_error(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <DetailForm
        form_ref={form_ref}
        layout={loaded.layout}
        record={form_record}
        draft={editor.draft}
        can_update={can_update}
        on_field_change={(name, value) => {
          set_editor((snap) => apply_field_edit(snap, name, value));
        }}
        on_field_focus={(name) => {
          set_editor((snap) => {
            if (snap.active_field != null && snap.active_field !== name) {
              return close_active_chunk(snap);
            }
            return snap;
          });
        }}
        on_field_blur={() => {
          set_editor((snap) => close_active_chunk(snap));
        }}
      />
    </>
  );
}

function detail_title_token(
  friendly_id_attr: string | null,
  record: Record<string, unknown>,
): string {
  if (friendly_id_attr != null) {
    const value = record[friendly_id_attr];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  if (typeof record.id === "string" && record.id.length > 0) {
    return record.id;
  }
  return "";
}
