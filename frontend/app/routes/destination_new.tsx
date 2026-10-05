import { useEffect, useMemo, useRef, useState } from "react";
import { data, useNavigate, useOutletContext } from "react-router";

import { fetch_me } from "../auth/api.server";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  DOCUMENT_BOOTSTRAP,
  forbidden_response,
  redirect_unauthorized,
  require_document_access,
} from "../auth/gate.server";
import { commit_active_editor_field } from "../detail/commit_active_editor_field";
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
import { DetailForm } from "../detail/detail_form";
import { partition_detail_layout } from "../detail/default_layout";
import { use_record_editor_undo } from "../detail/use_record_editor_undo";
import { class_field_meta } from "../generated/field_meta";
import { create_record } from "../records/browser_api";
import { create_schema_for_class } from "../records/create_schema_registry";
import { prepare_create_body } from "../records/mutation_body";
import { record_detail_path } from "../records/record_paths";
import { can_create_class } from "../shell/nav_filter";
import { ShellContextBar } from "../shell/shell_context_bar";
import { clock_env } from "../shell/well_known_substitute";
import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/destination_new";

export type NewLoaderData = {
  class_name: string;
  class_display_name: string;
  title_token: string;
  copy_path: string;
  seed_record: Record<string, unknown>;
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
  if (class_name == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const field_meta = class_field_meta(class_name);
  if (field_meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  // Reserved query: ignore unknown view=; always default layout in M1.
  void new URL(request.url).searchParams.get("view");

  const access_token = await require_document_access(request);
  if (access_token === DOCUMENT_BOOTSTRAP) {
    return data(null, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const me = await fetch_me(access_token);
    if (!can_create_class(me.permissions, class_name)) {
      throw forbidden_response();
    }

    const layout = partition_detail_layout(field_meta);
    const seed_record = record_from_create_defaults(field_meta, clock_env());

    return data({
      class_name,
      class_display_name: field_meta.display_name,
      title_token: "(new)",
      copy_path: `/${class_name}/new`,
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

export default function DestinationNewPage({
  loaderData,
}: Route.ComponentProps) {
  if (loaderData == null) {
    return null;
  }
  const loaded = loaderData;
  const { me } = useOutletContext<AuthenticatedOutletContext>();
  const can_create = can_create_class(me.permissions, loaded.class_name);
  const field_meta = class_field_meta(loaded.class_name);
  const editable = useMemo(
    () => editable_field_names(loaded.layout),
    [loaded.layout],
  );

  const [editor, set_editor] = useState<EditorSnapshot>(() =>
    create_editor_snapshot(loaded.seed_record, editable),
  );
  const [display_record, set_display_record] = useState<Record<string, unknown>>(
    loaded.seed_record,
  );
  const [save_error, set_save_error] = useState<string | null>(null);
  const [save_pending, set_save_pending] = useState(false);

  const form_ref = useRef<HTMLDivElement>(null);
  const editor_ref = useRef(editor);
  editor_ref.current = editor;
  const navigate = useNavigate();

  const dirty = is_dirty(editor.baseline, editor.draft, editable);
  const merged_for_enablement =
    field_meta != null
      ? merge_create_body(field_meta, editor.draft)
      : { ...editor.draft };
  const create_schema =
    field_meta != null ? create_schema_for_class(loaded.class_name) : null;
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
    if (!can_create || save_pending) {
      return;
    }
    // Time24Field commits on blur; flush before reading draft for create body.
    commit_active_editor_field(form_ref.current);
    const draft = editor_ref.current.draft;
    const prepared = prepare_create_body(
      loaded.class_name,
      draft,
      clock_env(),
    );
    if (!prepared.ok) {
      set_save_error(prepared.detail);
      return;
    }
    set_save_error(null);
    set_save_pending(true);
    void create_record(loaded.class_name, prepared.body).then((result) => {
      set_save_pending(false);
      if (!result.ok) {
        set_save_error(result.detail);
        return;
      }
      const meta_for_nav = class_field_meta(loaded.class_name);
      const locator =
        meta_for_nav != null
          ? preferred_create_locator(meta_for_nav, result.record)
          : typeof result.record.id === "string"
            ? result.record.id
            : null;
      if (locator != null) {
        void navigate(record_detail_path(loaded.class_name, locator));
      } else {
        set_save_error("Create succeeded but record locator is missing");
      }
    });
  };

  function on_refresh() {
    set_display_record(loaded.seed_record);
    set_editor(reset_editor_from_record(loaded.seed_record, editable));
    set_save_error(null);
  }

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
