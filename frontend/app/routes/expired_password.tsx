import { Form, data, redirect } from "react-router";

import { fetch_me } from "../auth/api.server";
import { ChangePasswordForm } from "../auth/change_password_form";
import { ApiUnauthorizedError } from "../auth/errors";
import {
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { parse_password_policy } from "../auth/password_policy";
import { get_access_session } from "../auth/session.server";
import { get_cached_system_config } from "../auth/system_config_cache.server";
import type { Route } from "./+types/expired_password";

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
  const session = await get_access_session(request);
  if (session == null) {
    throw redirect_unauthenticated(request);
  }
  if (!session.password_change_required) {
    throw redirect("/");
  }

  try {
    const [me, record] = await Promise.all([
      fetch_me(session.token),
      get_cached_system_config(session.token),
    ]);
    const policy = parse_password_policy(record);
    return data(
      {
        username: me.username,
        display_name: me.display_name,
        policy,
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
    throw new Response("Password policy unavailable", {
      status: 503,
      statusText: "Password policy unavailable",
    });
  }
}

export default function ExpiredPasswordPage({
  loaderData,
}: Route.ComponentProps) {
  const { username, display_name, policy } = loaderData;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-lg font-medium text-slate-900">
          Change Password for {username}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Your password has expired. Choose a new password to continue.
        </p>
        <ChangePasswordForm
          username={username}
          display_name={display_name}
          policy={policy}
          after_success="home"
        />
        <Form method="post" action="/logout" className="mt-6 text-center">
          <button
            type="submit"
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Sign out
          </button>
        </Form>
      </div>
    </main>
  );
}
