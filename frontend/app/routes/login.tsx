import { Form, data, redirect, useActionData } from "react-router";

import { login_with_password } from "../auth/api.server";
import { ApiUnauthorizedError } from "../auth/errors";
import { safe_next_path } from "../auth/next_path";
import {
  commit_access_token,
  get_access_token,
} from "../auth/session.server";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in — Untangled" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safe_next_path(url.searchParams.get("next"), "/");
  const token = await get_access_token(request);
  if (token != null) {
    throw redirect(next);
  }
  return { next };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safe_next_path(String(form.get("next") ?? ""), "/");

  if (!username || !password) {
    return data(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  try {
    const { access_token } = await login_with_password(username, password);
    const set_cookie = await commit_access_token(request, access_token);
    return redirect(next, {
      headers: { "Set-Cookie": set_cookie },
    });
  } catch (error) {
    if (error instanceof ApiUnauthorizedError) {
      return data(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }
    throw error;
  }
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const action_data = useActionData<typeof action>();
  const { next } = loaderData;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1">
          <img
            src="/UntangledLogo-nobg-black.svg"
            alt="Untangled"
            className="h-[75px] w-auto"
          />
        </h1>
        <p className="text-sm text-slate-600 mb-8">
          Sign in with your Untangled credentials.
        </p>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">
              Username
            </span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </label>

          {action_data?.error != null && (
            <p className="text-sm text-red-700" role="alert">
              {action_data.error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            Sign in
          </button>
        </Form>
      </div>
    </main>
  );
}
