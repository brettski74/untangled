import { redirect } from "react-router";

import { fetch_logout } from "../auth/api.server";
import {
  expire_logout_cookies,
  read_access_cookie,
  read_csrf_cookie,
} from "../auth/session.server";
import type { Route } from "./+types/logout";

function submitted_csrf_token(request: Request, form: FormData): string {
  const header = request.headers.get("X-CSRF-Token") ?? "";
  if (header !== "") {
    return header;
  }
  const from_form = form.get("csrf_token");
  return typeof from_form === "string" ? from_form : "";
}

export async function action({ request }: Route.ActionArgs) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return Response.json({ detail: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => new FormData());
  const result = await fetch_logout({
    access_token: read_access_cookie(request),
    origin: request.headers.get("Origin"),
    csrf_cookie: read_csrf_cookie(request),
    csrf_token: submitted_csrf_token(request, form),
  });

  if (result.kind === "unavailable") {
    return new Response("Sign-out is temporarily unavailable", {
      status: 503,
      statusText: "Sign-out is temporarily unavailable",
    });
  }
  if (result.kind === "forbidden") {
    return Response.json({ detail: "Forbidden" }, { status: 403 });
  }

  return redirect("/login", { headers: expire_logout_cookies() });
}

export async function loader() {
  return Response.json(
    { detail: "Method not allowed" },
    { status: 405, statusText: "Method not allowed" },
  );
}

export default function LogoutPage() {
  return null;
}
