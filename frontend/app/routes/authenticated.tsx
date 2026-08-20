import { Outlet, data } from "react-router";

import { fetch_me } from "../auth/api.server";
import { RefreshBootstrap } from "../auth/refresh_bootstrap";
import type { UserProfile } from "../auth/schemas";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  DOCUMENT_BOOTSTRAP,
  forbidden_response,
  redirect_unauthorized,
  require_document_access,
} from "../auth/gate.server";
import { read_csrf_cookie } from "../auth/session.server";
import { load_default_nav } from "../shell/nav_config.server";
import { filter_nav_by_permissions } from "../shell/nav_filter";
import type { NavBarView } from "../shell/nav_schema";
import { ShellLayout } from "../shell/shell_layout";
import type { Route } from "./+types/authenticated";

export type AuthenticatedOutletContext = {
  me: UserProfile;
  nav: NavBarView;
};

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function loader({ request }: Route.LoaderArgs) {
  const access = await require_document_access(request);
  if (access === DOCUMENT_BOOTSTRAP) {
    return data({ bootstrap: true as const }, { headers: PRIVATE_NO_STORE });
  }

  try {
    const me = await fetch_me(access);
    const nav = filter_nav_by_permissions(
      load_default_nav(),
      me.permissions,
    );

    return data(
      { bootstrap: false as const, me, nav, csrf_token: read_csrf_cookie(request) },
      { headers: PRIVATE_NO_STORE },
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
  if (loaderData.bootstrap) {
    return <RefreshBootstrap />;
  }
  const { me, nav, csrf_token } = loaderData;
  const outlet_context: AuthenticatedOutletContext = { me, nav };

  return (
    <ShellLayout
      display_name={me.display_name}
      username={me.username}
      csrf_token={csrf_token}
      nav={nav}
    >
      <Outlet context={outlet_context} />
    </ShellLayout>
  );
}
