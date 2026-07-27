import { data } from "react-router";

import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import { DetailContextBar } from "../detail/detail_context_bar";
import { DetailForm } from "../detail/detail_form";
import { partition_detail_layout } from "../detail/default_layout";
import { class_field_meta } from "../generated/field_meta";
import { fetch_record } from "../records/fetch.server";
import { record_detail_path } from "../records/record_paths";
import { ShellContextBar } from "../shell/shell_context_bar";
import { class_for_collection } from "../shell/nav_paths";
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

export default function DestinationDetailPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      <ShellContextBar>
        <DetailContextBar
          class_display_name={loaderData.class_display_name}
          title_token={loaderData.title_token}
          copy_url={loaderData.copy_path}
        />
      </ShellContextBar>
      <DetailForm layout={loaderData.layout} record={loaderData.record} />
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
