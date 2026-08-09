import { data, useActionData, useOutletContext } from "react-router";

import { change_password, fetch_me } from "../auth/api.server";
import {
  ChangePasswordForm,
  type ChangePasswordActionData,
} from "../auth/change_password_form";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  forbidden_response,
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { parse_password_policy } from "../auth/password_policy";
import { get_access_token } from "../auth/session.server";
import { SYSTEM_CONFIG_ID } from "../generated/well_known";
import { fetch_record } from "../records/fetch.server";
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
      fetch_record(access_token, "system-configs", SYSTEM_CONFIG_ID),
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
    if (error instanceof ApiForbiddenError) {
      throw forbidden_response();
    }
    // Fail closed when system_config password policy cannot be read.
    throw new Response("Password policy unavailable", {
      status: 503,
      statusText: "Password policy unavailable",
    });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  const form = await request.formData();
  const current_password = String(form.get("current_password") ?? "");
  const new_password = String(form.get("new_password") ?? "");
  const verify_new_password = String(form.get("verify_new_password") ?? "");

  try {
    const result = await change_password(access_token, {
      current_password,
      new_password,
      verify_new_password,
    });
    const payload: ChangePasswordActionData = result.ok
      ? { ok: true, detail: result.detail }
      : { ok: false, detail: result.detail };
    return data(payload, { status: result.ok ? 200 : 422 });
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

export default function ChangePasswordPage({
  loaderData,
}: Route.ComponentProps) {
  const action_data = useActionData<typeof action>();
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
        action_data={action_data}
      />
    </>
  );
}
