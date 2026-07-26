import { data } from "react-router";

import { load_default_nav } from "../shell/nav_config.server";
import { find_list_option } from "../shell/nav_paths";
import { DestinationPlaceholder } from "./destination_placeholder";
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

export async function loader({ params }: Route.LoaderArgs) {
  const collection = params.collection;
  const list_id = params.list_id;
  if (collection == null || list_id == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const match = find_list_option(load_default_nav(), collection, list_id);
  if (match == null) {
    throw new Response("Not Found", { status: 404 });
  }

  return data({
    section_display_name: match.section.display_name,
    option_display_name: match.option.display_name,
    option_type: match.option.option_type as "list",
    class_name: match.section.class_name,
    path: match.path,
    predicate: match.option.predicate,
  });
}

export default function DestinationListPage({
  loaderData,
}: Route.ComponentProps) {
  return <DestinationPlaceholder {...loaderData} />;
}
