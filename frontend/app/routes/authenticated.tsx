import { Form, Outlet, data } from "react-router";

import { fetch_me } from "../auth/api.server";
import type { UserProfile } from "../auth/schemas";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import type { Route } from "./+types/authenticated";

export type AuthenticatedOutletContext = {
  me: UserProfile;
};

export async function loader({ request }: Route.LoaderArgs) {
  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const me = await fetch_me(access_token);
    return data(
      { me },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
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
  const { me } = loaderData;
  const outlet_context: AuthenticatedOutletContext = { me };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-semibold tracking-tight">Untangled</p>
            <p className="text-xs text-slate-500">
              Signed in as {me.display_name}{" "}
              <span className="text-slate-400">({me.username})</span>
            </p>
          </div>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </Form>
        </div>
      </header>
      <Outlet context={outlet_context} />
    </div>
  );
}
