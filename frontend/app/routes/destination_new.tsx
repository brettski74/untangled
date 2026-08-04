import { useEffect, useMemo, useRef, useState } from "react";
import {
  data,
  useFetcher,
  useNavigate,
  useOutletContext,
} from "react-router";

import { fetch_me } from "../auth/api.server";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import {
  merge_create_body,
  new_save_enabled,
  preferred_create_locator,
  record_from_create_defaults,
} from "../detail/create_defaults";
import { DetailContextBar } from "../detail/detail_context_bar";
import {
  apply_field_edit,
  close_active_chunk,
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
import { create_record } from "../records/create.server";
import {
  create_schema_for_class,
  create_schema_keys,
} from "../records/create_schema_registry";
import { format_api_error_detail } from "../records/api_error_detail";
import { record_detail_path } from "../records/record_paths";
import { is_json_object } from "../records/update.server";
import {
  zod_error_detail,
  zod_error_http_status,
} from "../records/zod_http_status";
import { can_create_class } from "../shell/nav_filter";
import { class_for_collection } from "../shell/nav_paths";
import { ShellContextBar } from "../shell/shell_context_bar";
import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/destination_new";

export type NewLoaderData = {
  collection: string;
  class_name: string;
  class_display_name: string;
  title_token: string;
  copy_path: string;
  seed_record: Record<string, unknown>;
  layout: ReturnType<typeof partition_detail_layout>;
};

export type NewSaveActionResult =
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
  if (collection == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const class_name = class_for_collection(collection);
  if (class_name == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const field_meta = class_field_meta(class_name);
  if (field_meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved query: ignore unknown view=; always default layout in M1.
  void new URL(request.url).searchParams.get("view");

  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const me = await fetch_me(access_token);
    if (!can_create_class(me.permissions, class_name)) {
      throw forbidden_response();
    }

    const layout = partition_detail_layout(field_meta);
    const seed_record = record_from_create_defaults(field_meta);

    return data({
      collection,
      class_name,
      class_display_name: field_meta.display_name,
      title_token: "(new)",
      copy_path: `/${collection}/new`,
      seed_record,
      layout,
    } satisfies NewLoaderData);
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
}: Route.ActionArgs): Promise<ReturnType<typeof data<NewSaveActionResult>>> {
  const collection = params.collection;
  if (collection == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const class_name = class_for_collection(collection);
  if (class_name == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const field_meta = class_field_meta(class_name);
  if (field_meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const me = await fetch_me(access_token);
    if (!can_create_class(me.permissions, class_name)) {
      return data(
        { ok: false, status: 403, detail: "Forbidden" },
        { status: 403 },
      );
    }
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
    throw error;
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

  const merged = merge_create_body(field_meta, body_unknown);
  const schema = create_schema_for_class(class_name);
  if (schema != null) {
    const known = create_schema_keys(schema);
    const unknown_keys = Object.keys(merged).filter((k) => !known.has(k));
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
    const parsed = schema.safeParse(merged);
    if (!parsed.success) {
      const status = zod_error_http_status(parsed.error);
      const { detail } = zod_error_detail(parsed.error);
      return data({ ok: false, status, detail }, { status });
    }
  }

  try {
    const record = await create_record(access_token, collection, merged);
    return data({ ok: true, record } satisfies NewSaveActionResult);
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
      let detail = error.statusText || `Create failed (${error.status})`;
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

export default function DestinationNewPage({
  loaderData,
}: Route.ComponentProps) {
  const { me } = useOutletContext<AuthenticatedOutletContext>();
  const can_create = can_create_class(me.permissions, loaderData.class_name);
  const field_meta = class_field_meta(loaderData.class_name);
  const editable = useMemo(
    () => editable_field_names(loaderData.layout),
    [loaderData.layout],
  );

  const [editor, set_editor] = useState<EditorSnapshot>(() =>
    create_editor_snapshot(loaderData.seed_record, editable),
  );
  const [display_record, set_display_record] = useState<Record<string, unknown>>(
    loaderData.seed_record,
  );
  const [save_error, set_save_error] = useState<string | null>(null);

  const form_ref = useRef<HTMLDivElement>(null);
  const editor_ref = useRef(editor);
  editor_ref.current = editor;
  const navigate = useNavigate();
  const fetcher = useFetcher<NewSaveActionResult>();
  const handled_fetcher_key = useRef<string | null>(null);

  const dirty = is_dirty(editor.baseline, editor.draft, editable);
  const merged_for_enablement =
    field_meta != null
      ? merge_create_body(field_meta, editor.draft)
      : { ...editor.draft };
  const create_schema =
    field_meta != null ? create_schema_for_class(loaderData.class_name) : null;
  const create_valid =
    create_schema == null
      ? true
      : create_schema.safeParse(merged_for_enablement).success;
  const save_enabled = new_save_enabled({
    can_create,
    dirty,
    create_valid,
    schema_available: create_schema != null,
  });

  // Apply successful create: navigate to detail; keep draft on failure.
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data == null) {
      return;
    }
    const data_key = `${fetcher.formAction ?? "create"}:${JSON.stringify(fetcher.data)}`;
    if (handled_fetcher_key.current === data_key) {
      return;
    }
    handled_fetcher_key.current = data_key;

    if (fetcher.data.ok) {
      set_save_error(null);
      const meta_for_nav = class_field_meta(loaderData.class_name);
      const locator =
        meta_for_nav != null
          ? preferred_create_locator(meta_for_nav, fetcher.data.record)
          : typeof fetcher.data.record.id === "string"
            ? fetcher.data.record.id
            : null;
      if (locator != null) {
        void navigate(record_detail_path(loaderData.collection, locator));
      } else {
        set_save_error("Create succeeded but record locator is missing");
      }
    } else {
      set_save_error(fetcher.data.detail);
    }
  }, [
    fetcher.state,
    fetcher.data,
    fetcher.formAction,
    loaderData.class_name,
    loaderData.collection,
    navigate,
  ]);

  use_record_editor_undo(
    form_ref,
    can_create,
    () => set_editor((snap) => undo_last_chunk(snap)),
    () => set_editor((snap) => close_active_chunk(snap)),
  );

  useEffect(() => {
    if (!can_create) {
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
  }, [can_create]);

  const activate_save_ref = useRef(() => {});
  activate_save_ref.current = () => {
    if (!can_create || fetcher.state !== "idle") {
      return;
    }
    // Time24Field commits on blur; flush before reading draft for create body.
    commit_active_editor_field(form_ref.current);
    const draft = editor_ref.current.draft;
    const meta_now = class_field_meta(loaderData.class_name);
    const merged =
      meta_now != null
        ? merge_create_body(meta_now, draft)
        : { ...draft };
    const schema = create_schema_for_class(loaderData.class_name);
    if (schema != null) {
      const parsed = schema.safeParse(merged);
      if (!parsed.success) {
        const { detail } = zod_error_detail(parsed.error);
        set_save_error(detail);
        return;
      }
    }
    set_save_error(null);
    void fetcher.submit(
      draft as Record<string, string | number | boolean | null>,
      {
        method: "POST",
        action: `.`,
        encType: "application/json",
      },
    );
  };

  function on_refresh() {
    set_display_record(loaderData.seed_record);
    set_editor(reset_editor_from_record(loaderData.seed_record, editable));
    set_save_error(null);
  }

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
        record={display_record}
        draft={editor.draft}
        can_update={can_create}
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
