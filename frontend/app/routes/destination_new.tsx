import { data } from "react-router";

import { load_default_nav } from "../shell/nav_config.server";
import { find_new_option } from "../shell/nav_paths";
import { DestinationPlaceholder } from "./destination_placeholder";
import type { Route } from "./+types/destination_new";

export function meta({ loaderData }: Route.MetaArgs) {
  if (loaderData == null) {
    return [{ title: "Untangled" }];
  }
  return [
    {
      title: `${loaderData.section_display_name} — ${loaderData.option_display_name} — Untangled`,
    },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const collection = params.collection;
  if (collection == null) {
    throw new Response("Not Found", { status: 404 });
  }

  const match = find_new_option(load_default_nav(), collection);
  if (match == null) {
    throw new Response("Not Found", { status: 404 });
  }

  return data({
    section_display_name: match.section.display_name,
    option_display_name: match.option.display_name,
    option_type: match.option.option_type as "new",
    class_name: match.section.class_name,
    path: match.path,
  });
}

export default function DestinationNewPage({
  loaderData,
}: Route.ComponentProps) {
  return <DestinationPlaceholder {...loaderData} />;
}
