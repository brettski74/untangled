import { useEffect, useMemo, useRef, useState } from "react";
import { data, useFetcher, useOutletContext, useRevalidator } from "react-router";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
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
import {
  update_schema_for_class,
  update_schema_keys,
} from "../records/update_schema_registry";
import { format_api_error_detail } from "../records/api_error_detail";
import {
  zod_error_detail,
  zod_error_http_status,
} from "../records/zod_http_status";
import { class_field_meta } from "../generated/field_meta";
import { fetch_record } from "../records/fetch.server";
import { record_detail_path } from "../records/record_paths";
import { is_json_object, update_record } from "../records/update.server";
import { can_update_class } from "../shell/nav_filter";
import { class_for_collection } from "../shell/nav_paths";
import { ShellContextBar } from "../shell/shell_context_bar";
import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/destination_detail";

export type DetailLoaderData = {
  collection: string;
  class_name: string;
  class_display_name: string;
  locator: string;
  title_token: string;
  copy_path: string;
  record: Record<string, unknown>;
  layout: ReturnType<typeof partition_detail_layout>;
};

export type DetailSaveActionResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; status: number; detail: string };

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
  const collection = params.collection;
  const locator = params.locator;
  if (collection == null || locator == null || locator === "") {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved path segments are registered as static routes; still fail closed.
  if (locator === "new" || locator === "lists") {
    throw new Response("Not Found", { status: 404 });
  }

  const class_name = class_for_collection(collection);
  if (class_name == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const meta = class_field_meta(class_name);
  if (meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved query: ignore unknown view=; always default layout in M1.
  void new URL(request.url).searchParams.get("view");

  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const record = await fetch_record(access_token, collection, locator);
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
      collection,
      class_name,
      class_display_name: meta.display_name,
      locator,
      title_token,
      copy_path: record_detail_path(collection, preferred_locator),
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

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<
  ReturnType<typeof data<DetailSaveActionResult>>
> {
  const collection = params.collection;
  const locator = params.locator;
  if (collection == null || locator == null || locator === "") {
    throw new Response("Not Found", { status: 404 });
  }
  if (locator === "new" || locator === "lists") {
    throw new Response("Not Found", { status: 404 });
  }

  const class_name = class_for_collection(collection);
  if (class_name == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  let body_unknown: unknown;
  try {
    body_unknown = await request.json();
  } catch {
    return data(
      { ok: false, status: 400, detail: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!is_json_object(body_unknown)) {
    return data(
      { ok: false, status: 400, detail: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  const patch_body = body_unknown;
  const schema = update_schema_for_class(class_name);
  if (schema != null) {
    const known = update_schema_keys(schema);
    const unknown_keys = Object.keys(patch_body).filter((k) => !known.has(k));
    if (unknown_keys.length > 0) {
      return data(
        {
          ok: false,
          status: 400,
          detail: `Unrecognized attributes: ${unknown_keys.join(", ")}`,
        },
        { status: 400 },
      );
    }
    const parsed = schema.safeParse(patch_body);
    if (!parsed.success) {
      const status = zod_error_http_status(parsed.error);
      const { detail } = zod_error_detail(parsed.error);
      return data({ ok: false, status, detail }, { status });
    }
  }

  try {
    const record = await update_record(
      access_token,
      collection,
      locator,
      patch_body,
    );
    return data({ ok: true, record } satisfies DetailSaveActionResult);
  } catch (error) {
    if (error instanceof ApiUnauthorizedError) {
      throw await redirect_unauthorized(request);
    }
    if (error instanceof ApiForbiddenError) {
      return data(
        { ok: false, status: 403, detail: "Forbidden" },
        { status: 403 },
      );
    }
    if (error instanceof Response) {
      let detail = error.statusText || `Update failed (${error.status})`;
      try {
        const text = await error.clone().text();
        if (text.length > 0) {
          try {
            const json: unknown = JSON.parse(text);
            detail = format_api_error_detail(json, text);
          } catch {
            detail = text;
          }
        }
      } catch {
        // keep statusText
      }
      return data(
        { ok: false, status: error.status, detail },
        { status: error.status },
      );
    }
    throw error;
  }
}

export default function DestinationDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { me } = useOutletContext<AuthenticatedOutletContext>();
  const can_update = can_update_class(me.permissions, loaderData.class_name);
  const editable = useMemo(
    () => editable_field_names(loaderData.layout),
    [loaderData.layout],
  );

  const [editor, set_editor] = useState<EditorSnapshot>(() =>
    create_editor_snapshot(loaderData.record, editable),
  );
  const [display_record, set_display_record] = useState<Record<string, unknown>>(
    loaderData.record,
  );
  const [save_error, set_save_error] = useState<string | null>(null);
  const [pending_refresh, set_pending_refresh] = useState(false);

  const form_ref = useRef<HTMLDivElement>(null);
  const editor_ref = useRef(editor);
  editor_ref.current = editor;
  const revalidator = useRevalidator();
  const fetcher = useFetcher<DetailSaveActionResult>();
  const handled_fetcher_key = useRef<string | null>(null);

  const dirty = is_dirty(editor.baseline, editor.draft, editable);
  const save_enabled = can_update && dirty;

  // Explicit refresh: discard dirty immediately from last known loader record,
  // then apply freshest loader data when revalidation idles. Incidental
  // revalidation while dirty (pending_refresh false) never resets.
  useEffect(() => {
    if (!pending_refresh || revalidator.state !== "idle") {
      return;
    }
    set_display_record(loaderData.record);
    set_editor(reset_editor_from_record(loaderData.record, editable));
    set_save_error(null);
    set_pending_refresh(false);
  }, [
    pending_refresh,
    revalidator.state,
    loaderData.record,
    editable,
  ]);

  // Apply successful save from fetcher; keep draft on failure.
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data == null) {
      return;
    }
    const data_key = `${fetcher.formAction ?? "save"}:${JSON.stringify(fetcher.data)}`;
    if (handled_fetcher_key.current === data_key) {
      return;
    }
    handled_fetcher_key.current = data_key;

    if (fetcher.data.ok) {
      set_display_record(fetcher.data.record);
      set_editor(reset_editor_from_record(fetcher.data.record, editable));
      set_save_error(null);
    } else {
      set_save_error(fetcher.data.detail);
    }
  }, [fetcher.state, fetcher.data, fetcher.formAction, editable]);

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
    if (!can_update || fetcher.state !== "idle") {
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
    set_save_error(null);
    void fetcher.submit(changed as Record<string, string | number | boolean | null>, {
      method: "PATCH",
      action: `.`,
      encType: "application/json",
    });
  };

  function on_refresh() {
    // Discard dirty immediately (user asked to reload); then revalidate.
    set_editor(reset_editor_from_record(loaderData.record, editable));
    set_display_record(loaderData.record);
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
          class_display_name={loaderData.class_display_name}
          title_token={loaderData.title_token}
          copy_url={loaderData.copy_path}
          dirty={dirty}
          save_enabled={save_enabled}
          save_pending={fetcher.state !== "idle"}
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
        layout={loaderData.layout}
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
