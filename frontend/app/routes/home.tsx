import { redirect } from "react-router";

import { fetch_me } from "../auth/api.server";
import { ApiForbiddenError, ApiUnauthorizedError } from "../auth/errors";
import {
  redirect_unauthenticated,
  redirect_unauthorized,
} from "../auth/gate.server";
import { get_access_token } from "../auth/session.server";
import { load_default_nav } from "../shell/nav_config.server";
import { default_landing_path } from "../shell/nav_landing";
import type { Route } from "./+types/home";

/**
 * Authenticated index: redirect to the permission-aware default landing when
 * one exists. This page is the fail-closed empty shell when the principal has
 * no visible nav destinations. Landing lives here (not the pathless layout)
 * so single-fetch `/_.data` requests still redirect — raw pathname checks on
 * the layout miss those URLs.
 */
export function meta({}: Route.MetaArgs) {
  return [
    { title: "Untangled" },
    {
      name: "description",
      content: "Authenticated operator workspace",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const access_token = await get_access_token(request);
  if (access_token == null) {
    throw redirect_unauthenticated(request);
  }

  try {
    const me = await fetch_me(access_token);
    const landing = default_landing_path(load_default_nav(), me.permissions);
    if (landing != null) {
      throw redirect(landing);
    }
    return null;
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (error instanceof ApiUnauthorizedError) {
      throw await redirect_unauthorized(request);
    }
    if (error instanceof ApiForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

export default function Home() {
  return (
    <div className="px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight mb-2">
        No destinations available
      </h1>
      <p className="text-sm text-slate-600 max-w-prose">
        Your account has no visible class navigation options. List/detail and
        create content will plug into these routes in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/13"
        >
          #13
        </a>
        ; richer session and API wiring in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/14"
        >
          #14
        </a>
        .
      </p>
    </div>
  );
}
