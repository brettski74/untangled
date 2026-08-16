import { Outlet, data, redirect } from "react-router";

import { fetch_me } from "../auth/api.server";
import type { UserProfile } from "../auth/schemas";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_session } from "../auth/session.server";
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
  const session = await get_access_session(request);
  if (session == null) {
    throw redirect_unauthenticated(request);
  }
  if (session.password_change_required) {
    throw redirect("/expired-password");
  }

  try {
    const me = await fetch_me(session.token);
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
      throw forbidden_response();
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
