import { data } from "react-router";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import { class_field_meta } from "../generated/field_meta";
import { BasicList } from "../list/basic_list";
import { list_display_columns } from "../list/columns";
import { search_collection } from "../records/search.server";
import { load_default_nav } from "../shell/nav_config.server";
import { find_list_option } from "../shell/nav_paths";
import type { Route } from "./+types/destination_list";

export function meta({ data: loader_data }: Route.MetaArgs) {
  if (loader_data == null) {
    return [{ title: "Untangled" }];
  }
  return [
    {
      title: `${loader_data.section_display_name} — ${loader_data.option_display_name} — Untangled`,
    },
  ];
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
      predicate: match.option.predicate ?? null,
      attributes,
    });

    return data({
      section_display_name: match.section.display_name,
      option_display_name: match.option.display_name,
      class_name: match.section.class_name,
      class_display_name: meta.display_name,
      path: match.path,
      collection,
      columns,
      rows: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
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

export default function DestinationListPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight text-slate-900">
          {loaderData.section_display_name} — {loaderData.option_display_name}
        </h1>
        <p className="text-xs text-slate-500">
          {loaderData.class_display_name}
          {loaderData.total === 1
            ? " · 1 record"
            : ` · ${loaderData.total} records`}
        </p>
      </div>
      <BasicList
        collection={loaderData.collection}
        columns={loaderData.columns}
        rows={loaderData.rows}
      />
    </div>
  );
}
