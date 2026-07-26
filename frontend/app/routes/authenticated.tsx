import { Outlet, data } from "react-router";

import { fetch_me } from "../auth/api.server";
import type { UserProfile } from "../auth/schemas";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import { load_default_nav } from "../shell/nav_config.server";
import { filter_nav_by_permissions } from "../shell/nav_filter";
import type { NavBarView } from "../shell/nav_schema";
import { ShellLayout } from "../shell/shell_layout";
import type { Route } from "./+types/authenticated";

export type AuthenticatedOutletContext = {
  me: UserProfile;
  nav: NavBarView;
};

export async function loader({ request }: Route.LoaderArgs) {
  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const me = await fetch_me(access_token);
    const nav = filter_nav_by_permissions(
      load_default_nav(),
      me.permissions,
    );

    return data(
      { me, nav },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (error instanceof ApiUnauthorizedError) {
      throw await redirect_unauthorized(request);
    }
    if (error instanceof ApiForbiddenError) {
      // Authenticated but denied — preserve session; surface as route error.
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

export default function AuthenticatedLayout({
  loaderData,
}: Route.ComponentProps) {
  const { me, nav } = loaderData;
  const outlet_context: AuthenticatedOutletContext = { me, nav };

  return (
    <ShellLayout
      display_name={me.display_name}
      username={me.username}
      nav={nav}
    >
      <Outlet context={outlet_context} />
    </ShellLayout>
  );
}
