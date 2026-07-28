import { data, useOutletContext } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  apply_column_order,
  clamp_column_width,
  column_set_signature,
  move_column_order,
  reconcile_column_layout,
  seed_column_layout,
  type ColumnLayoutSession,
} from "../list/column_layout";
import { list_display_columns, type ListColumn } from "../list/columns";
import { ListFilterChrome } from "../list/filter_chrome";
import {
  apply_sort_click,
  parse_sort_form_value,
  type ListSortSpec,
} from "../list/header_sort";
import {
  ListContextBar,
  type ListSearchPayload,
} from "../list/list_context_bar";
import { list_destination_ui_sync } from "../list/list_destination_sync";
import { ListPagination } from "../list/list_pagination";
import {
  clamped_offset_for_total,
  DEFAULT_OFFSET,
  DEFAULT_PER_PAGE,
  parse_paging_form_values,
  start_past_last_page,
} from "../list/pagination";
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
  sort: ListSortSpec[] | null,
  limit: number = DEFAULT_PER_PAGE,
  offset: number = DEFAULT_OFFSET,
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
      limit,
      offset,
      ...(sort != null && sort.length > 0 ? { sort } : {}),
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
    const payload = await run_list_search(request, params, baseline, null);
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
  const sort_parsed = parse_sort_form_value(form.get("sort"));
  if (!sort_parsed.ok) {
    throw new Response("Invalid sort", { status: 400 });
  }

  const paging = parse_paging_form_values(form.get("limit"), form.get("offset"));
  if (!paging.ok) {
    throw new Response("Invalid limit or offset", { status: 422 });
  }

  try {
    const payload = await run_list_search(
      request,
      params,
      parsed.predicate,
      sort_parsed.sort,
      paging.limit,
      paging.offset,
    );
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
  const [layout_notice, set_layout_notice] = useState<string | null>(null);
  const [sort, set_sort] = useState<ListSortSpec[]>([]);
  const [column_layout, set_column_layout] = useState<ColumnLayoutSession>(
    () => seed_column_layout(loaderData.columns),
  );
  const [column_signature, set_column_signature] = useState(() =>
    column_set_signature(loaderData.columns),
  );
  const loader_column_signature = column_set_signature(loaderData.columns);

  const fetcher = useFetcher<ListSearchActionResult>();
  const fetcher_path_ref = useRef<string | null>(null);
  const seeded_signature_ref = useRef(column_set_signature(loaderData.columns));
  const seeded_path_ref = useRef(loaderData.path);
  const effective_ref = useRef<SearchPredicate | null>(
    search.effective_predicate ?? loaderData.baseline_predicate,
  );
  const sort_ref = useRef<ListSortSpec[]>(sort);
  const paging_ref = useRef({ limit: search.limit, offset: search.offset });
  const clamp_inflight_ref = useRef(false);

  useEffect(() => {
    sort_ref.current = sort;
  }, [sort]);

  useEffect(() => {
    paging_ref.current = { limit: search.limit, offset: search.offset };
  }, [search.limit, search.offset]);

  useEffect(() => {
    const synced = list_destination_ui_sync(loaderData);
    set_search(synced.search);
    set_selected_name(synced.quick_filter.selected_name);
    set_values(synced.quick_filter.values);
    set_warning(synced.quick_filter.warning);
    set_layout_notice(null);
    set_sort([]);
    const seeded = seed_column_layout(loaderData.columns);
    const signature = column_set_signature(loaderData.columns);
    set_column_layout(seeded);
    set_column_signature(signature);
    seeded_signature_ref.current = signature;
    seeded_path_ref.current = loaderData.path;
    effective_ref.current =
      synced.search.effective_predicate ?? loaderData.baseline_predicate;
    paging_ref.current = {
      limit: synced.search.limit,
      offset: synced.search.offset,
    };
    clamp_inflight_ref.current = false;
    fetcher_path_ref.current = null;
    // Same destination identity for search rows and list chrome.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- path is the list identity
  }, [loaderData.path]);

  useEffect(() => {
    // Destination identity changed — path effect owns the reset (order-independent).
    if (seeded_path_ref.current !== loaderData.path) {
      return;
    }
    if (loader_column_signature === seeded_signature_ref.current) {
      return;
    }
    const reconciled = reconcile_column_layout(
      loaderData.columns,
      column_layout,
      column_signature,
    );
    seeded_signature_ref.current = reconciled.signature;
    set_sort([]);
    if (reconciled.reset) {
      set_column_layout(reconciled.layout);
      set_column_signature(reconciled.signature);
      set_layout_notice(
        "List columns changed — layout reset to schema defaults. Reload if this persists.",
      );
    } else {
      set_column_signature(reconciled.signature);
    }
    // Mid-session column-set identity only (hot reload / regenerated meta).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature/layout owned elsewhere
  }, [loader_column_signature, loaderData.path]);

  useEffect(() => {
    effective_ref.current =
      search.effective_predicate ?? loaderData.baseline_predicate;
  }, [search.effective_predicate, loaderData.baseline_predicate]);

  const submit_search = useCallback(
    (args: {
      predicate: SearchPredicate | null;
      /** Omit to keep the current user sort list. */
      sort?: ListSortSpec[];
      limit?: number;
      offset?: number;
      reset_start?: boolean;
    }) => {
      const sort = args.sort ?? sort_ref.current;
      const limit = args.limit ?? paging_ref.current.limit;
      let offset = args.offset ?? paging_ref.current.offset;
      if (args.reset_start) {
        offset = 0;
      }
      paging_ref.current = { limit, offset };
      const form = new FormData();
      form.set(
        "predicate",
        args.predicate == null ? "null" : JSON.stringify(args.predicate),
      );
      if (sort.length > 0) {
        form.set("sort", JSON.stringify(sort));
      }
      form.set("limit", String(limit));
      form.set("offset", String(offset));
      fetcher_path_ref.current = loaderData.path;
      void fetcher.submit(form, { method: "post" });
    },
    [fetcher, loaderData.path],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data == null) {
      return;
    }
    if (fetcher_path_ref.current !== loaderData.path) {
      return;
    }
    const result = fetcher.data;
    if (!result.ok) {
      clamp_inflight_ref.current = false;
      set_warning(result.detail);
      return;
    }
    // Refresh/sort (or any keep-start search) may land past the last page when
    // the result set shrinks — clamp once and re-fetch.
    if (
      start_past_last_page(result.offset, result.total, result.limit) &&
      !clamp_inflight_ref.current
    ) {
      clamp_inflight_ref.current = true;
      const clamped_offset = clamped_offset_for_total(
        result.total,
        result.limit,
      );
      effective_ref.current = result.effective_predicate;
      submit_search({
        predicate: result.effective_predicate,
        limit: result.limit,
        offset: clamped_offset,
      });
      return;
    }
    clamp_inflight_ref.current = false;
    effective_ref.current = result.effective_predicate;
    paging_ref.current = { limit: result.limit, offset: result.offset };
    set_search({
      rows: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      effective_predicate: result.effective_predicate,
    });
  }, [fetcher.state, fetcher.data, loaderData.path, submit_search]);

  const on_selected_name_change = useCallback((name: string) => {
    set_selected_name(name);
    set_values({});
    set_warning(null);
  }, []);

  const on_paging_change = useCallback(
    (next: { limit: number; offset: number; search: boolean }) => {
      paging_ref.current = { limit: next.limit, offset: next.offset };
      if (!next.search) {
        set_search((current) => ({
          ...current,
          limit: next.limit,
          offset: next.offset,
        }));
        return;
      }
      submit_search({
        predicate: effective_ref.current,
        limit: next.limit,
        offset: next.offset,
      });
    },
    [submit_search],
  );

  const on_sort_click = useCallback(
    (attribute: string) => {
      const next = apply_sort_click(sort_ref.current, attribute);
      sort_ref.current = next;
      set_sort(next);
      set_layout_notice(null);
      submit_search({
        predicate: effective_ref.current,
        sort: next,
      });
    },
    [submit_search],
  );

  const on_reorder = useCallback((from_index: number, to_index: number) => {
    set_column_layout((current) => ({
      ...current,
      order: move_column_order(current.order, from_index, to_index),
    }));
  }, []);

  const on_resize_commit = useCallback(
    (attribute: string, width_px: number) => {
      set_column_layout((current) => ({
        ...current,
        widths: {
          ...current.widths,
          [attribute]: clamp_column_width(width_px),
        },
      }));
    },
    [],
  );

  const display_columns = useMemo(() => {
    try {
      return apply_column_order(loaderData.columns, column_layout.order);
    } catch (error) {
      console.warn(
        "list column session order invalid; falling back to schema defaults",
        error,
      );
      return loaderData.columns;
    }
  }, [loaderData.columns, column_layout.order]);

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
          submit_search={submit_search}
          selected_name={selected_name}
          values={values}
          warning={warning}
          on_selected_name_change={on_selected_name_change}
          on_values_change={set_values}
          on_warning_change={set_warning}
        />
      </ShellContextBar>

      <ListFilterChrome
        key={loaderData.path}
        attributes={loaderData.attributes}
        effective_predicate={search.effective_predicate}
        busy={busy}
        submit_search={submit_search}
        on_warning={set_warning}
      />

      {layout_notice != null ? (
        <p
          className="shrink-0 px-4 py-1 text-xs text-amber-800"
          role="status"
        >
          {layout_notice}
        </p>
      ) : null}

      <BasicList
        collection={loaderData.collection}
        columns={display_columns}
        widths={column_layout.widths}
        sort={sort}
        rows={search.rows}
        on_sort_click={on_sort_click}
        on_reorder={on_reorder}
        on_resize_commit={on_resize_commit}
      />

      <ListPagination
        total={search.total}
        limit={search.limit}
        offset={search.offset}
        busy={busy}
        on_paging_change={on_paging_change}
      />
    </div>
  );
}
