import { redirect } from "react-router";

import { destroy_session } from "../auth/session.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const set_cookie = await destroy_session(request);
  return redirect("/login", {
    headers: { "Set-Cookie": set_cookie },
  });
}

export async function loader() {
  return redirect("/login");
}

export default function LogoutPage() {
  return null;
}
