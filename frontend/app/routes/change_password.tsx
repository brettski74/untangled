import { data, useOutletContext } from "react-router";

import { fetch_me } from "../auth/api.server";
import { ChangePasswordForm } from "../auth/change_password_form";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { parse_password_policy } from "../auth/password_policy";
import { session_max_refresh_retries_from_config } from "../auth/refresh_fetch";
import { get_access_token } from "../auth/session.server";
import { get_cached_system_config } from "../auth/system_config_cache.server";
import { ShellContextBar } from "../shell/shell_context_bar";
import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/change_password";

export function meta({ loaderData: loader_data }: Route.MetaArgs) {
  const username = loader_data?.username ?? "";
  return [
    {
      title: username
        ? `Change Password for ${username} — Untangled`
        : "Change Password — Untangled",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const [me, record] = await Promise.all([
      fetch_me(access_token),
      get_cached_system_config(access_token),
    ]);
    const policy = parse_password_policy(record);
    return data(
      {
        username: me.username,
        display_name: me.display_name,
        policy,
        max_refresh_retries: session_max_refresh_retries_from_config(
          record.session_max_refresh_retries,
        ),
      },
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
    throw new Response("Password policy unavailable", {
      status: 503,
      statusText: "Password policy unavailable",
    });
  }
}

export default function ChangePasswordPage({
  loaderData,
}: Route.ComponentProps) {
  const outlet = useOutletContext<AuthenticatedOutletContext>();
  const username = loaderData.username || outlet.me.username;
  const display_name = loaderData.display_name || outlet.me.display_name;

  return (
    <>
      <ShellContextBar>
        <div className="flex h-full min-w-0 items-center px-3">
          <div className="min-w-0 flex-1 truncate text-sm font-medium">
            Change Password for {username}
          </div>
        </div>
      </ShellContextBar>
      <ChangePasswordForm
        username={username}
        display_name={display_name}
        policy={loaderData.policy}
        max_refresh_retries={loaderData.max_refresh_retries}
        after_success="stay"
      />
    </>
  );
}
