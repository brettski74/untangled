import { data, useOutletContext } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import {
  class_field_meta,
  type AttributeFieldMeta,
} from "../generated/field_meta";
import { BasicList } from "../list/basic_list";
import { list_display_columns, type ListColumn } from "../list/columns";
import { ListFilterChrome } from "../list/filter_chrome";
import {
  ListContextBar,
  type ListSearchPayload,
} from "../list/list_context_bar";
import { list_destination_ui_sync } from "../list/list_destination_sync";
import {
  parse_predicate_json,
  type QuickFilterValues,
  type SearchPredicate,
} from "../list/quick_filter";
import {
  SearchApiError,
  search_collection,
} from "../records/search.server";
import type { AuthenticatedOutletContext } from "./authenticated";
import { can_create_class } from "../shell/nav_filter";
import { load_default_nav } from "../shell/nav_config.server";
import { find_list_option } from "../shell/nav_paths";
import { ShellContextBar } from "../shell/shell_context_bar";
import type { Route } from "./+types/destination_list";

export type ListLoaderData = {
  section_display_name: string;
  option_display_name: string;
  class_name: string;
  class_display_name: string;
  path: string;
  collection: string;
  columns: ListColumn[];
  attributes: AttributeFieldMeta[];
  baseline_predicate: SearchPredicate | null;
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  effective_predicate: SearchPredicate | null;
};

export type ListSearchActionResult =
  | ({ ok: true } & ListSearchPayload)
  | { ok: false; status: number; detail: string };

export function meta({ loaderData: loader_data }: Route.MetaArgs) {
  if (loader_data == null) {
    return [{ title: "Untangled" }];
  }
  return [
    {
      title: `${loader_data.section_display_name} — ${loader_data.option_display_name} — Untangled`,
    },
  ];
}

async function run_list_search(
  request: Request,
  params: Route.LoaderArgs["params"],
  predicate: SearchPredicate | null,
): Promise<ListLoaderData> {
  const collection = params.collection;
  const list_id = params.list_id;
  if (collection == null || list_id == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const match = find_list_option(load_default_nav(), collection, list_id);
  if (match == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  const meta = class_field_meta(match.section.class_name);
  if (meta == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const columns = list_display_columns(meta);
  const attributes = columns.map((column) => column.name_snake);

  try {
    const result = await search_collection(access_token, collection, {
      predicate,
      attributes,
    });

    return {
      section_display_name: match.section.display_name,
      option_display_name: match.option.display_name,
      class_name: match.section.class_name,
      class_display_name: meta.display_name,
      path: match.path,
      collection,
      columns,
      attributes: [...meta.attributes],
      baseline_predicate:
        (match.option.predicate as SearchPredicate | undefined) ?? null,
      rows: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      effective_predicate: predicate,
    };
  } catch (error) {
    if (error instanceof SearchApiError) {
      throw error;
    }
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

export async function loader({ request, params }: Route.LoaderArgs) {
  const collection = params.collection;
  const list_id = params.list_id;
  if (collection == null || list_id == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const match = find_list_option(load_default_nav(), collection, list_id);
  if (match == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const baseline =
    (match.option.predicate as SearchPredicate | undefined) ?? null;
  try {
    const payload = await run_list_search(request, params, baseline);
    return data(payload);
  } catch (error) {
    if (error instanceof SearchApiError) {
      // Nav baseline should always be valid; surface as opaque failure.
      throw new Response(error.detail, { status: error.status });
    }
    throw error;
  }
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<ReturnType<typeof data<ListSearchActionResult>>> {
  const form = await request.formData();
  const parsed = parse_predicate_json(form.get("predicate"));
  if (!parsed.ok) {
    throw new Response("Invalid predicate", { status: 400 });
  }

  try {
    const payload = await run_list_search(request, params, parsed.predicate);
    return data({
      ok: true,
      rows: payload.rows,
      total: payload.total,
      limit: payload.limit,
      offset: payload.offset,
      effective_predicate: payload.effective_predicate,
    } satisfies ListSearchActionResult);
  } catch (error) {
    if (error instanceof SearchApiError) {
      return data(
        {
          ok: false,
          status: error.status,
          detail: error.detail,
        } satisfies ListSearchActionResult,
        { status: error.status },
      );
    }
    throw error;
  }
}

/**
 * Action returns the searched rows via fetcher; skip loader revalidation so the
 * baseline nav predicate does not clobber the effective filter result set.
 */
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: {
  formMethod?: string;
  defaultShouldRevalidate: boolean;
}) {
  if (formMethod != null && formMethod.toUpperCase() !== "GET") {
    return false;
  }
  return defaultShouldRevalidate;
}

export default function DestinationListPage({
  loaderData,
}: Route.ComponentProps) {
  const { me } = useOutletContext<AuthenticatedOutletContext>();
  const can_create = can_create_class(me.permissions, loaderData.class_name);

  const initial = list_destination_ui_sync(loaderData);
  const [search, set_search] = useState<ListSearchPayload>(initial.search);
  const [selected_name, set_selected_name] = useState(
    initial.quick_filter.selected_name,
  );
  const [values, set_values] = useState<QuickFilterValues>(
    initial.quick_filter.values,
  );
  const [warning, set_warning] = useState<string | null>(
    initial.quick_filter.warning,
  );

  const fetcher = useFetcher<ListSearchActionResult>();
  const fetcher_path_ref = useRef<string | null>(null);
  const effective_ref = useRef<SearchPredicate | null>(
    search.effective_predicate ?? loaderData.baseline_predicate,
  );

  useEffect(() => {
    const synced = list_destination_ui_sync(loaderData);
    set_search(synced.search);
    set_selected_name(synced.quick_filter.selected_name);
    set_values(synced.quick_filter.values);
    set_warning(synced.quick_filter.warning);
    effective_ref.current =
      synced.search.effective_predicate ?? loaderData.baseline_predicate;
    fetcher_path_ref.current = null;
    // Same destination identity for search rows and quick-filter chrome.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- path is the list identity
  }, [loaderData.path]);

  useEffect(() => {
    effective_ref.current =
      search.effective_predicate ?? loaderData.baseline_predicate;
  }, [search.effective_predicate, loaderData.baseline_predicate]);

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data == null) {
      return;
    }
    if (fetcher_path_ref.current !== loaderData.path) {
      return;
    }
    const result = fetcher.data;
    if (!result.ok) {
      set_warning(result.detail);
      return;
    }
    effective_ref.current = result.effective_predicate;
    set_search({
      rows: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      effective_predicate: result.effective_predicate,
    });
  }, [fetcher.state, fetcher.data, loaderData.path]);

  const submit_predicate = useCallback(
    (predicate: SearchPredicate | null) => {
      const form = new FormData();
      form.set(
        "predicate",
        predicate == null ? "null" : JSON.stringify(predicate),
      );
      fetcher_path_ref.current = loaderData.path;
      void fetcher.submit(form, { method: "post" });
    },
    [fetcher, loaderData.path],
  );

  const on_selected_name_change = useCallback((name: string) => {
    set_selected_name(name);
    set_values({});
    set_warning(null);
  }, []);

  const busy = fetcher.state !== "idle";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ShellContextBar>
        <ListContextBar
          class_display_name={loaderData.class_display_name}
          collection={loaderData.collection}
          list_path={loaderData.path}
          can_create={can_create}
          attributes={loaderData.attributes}
          effective_ref={effective_ref}
          busy={busy}
          submit_predicate={submit_predicate}
          selected_name={selected_name}
          values={values}
          warning={warning}
          on_selected_name_change={on_selected_name_change}
          on_values_change={set_values}
          on_warning_change={set_warning}
        />
      </ShellContextBar>

      <ListFilterChrome
        attributes={loaderData.attributes}
        effective_predicate={search.effective_predicate}
        busy={busy}
        on_execute={submit_predicate}
        on_warning={set_warning}
      />

      <div className="shrink-0 border-b border-slate-200 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight text-slate-900">
          {loaderData.option_display_name}
        </h1>
        <p className="text-xs text-slate-500">
          {search.total === 1 ? "1 record" : `${search.total} records`}
        </p>
      </div>
      <BasicList
        collection={loaderData.collection}
        columns={loaderData.columns}
        rows={search.rows}
      />
    </div>
  );
}
