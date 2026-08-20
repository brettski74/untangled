import { useEffect, useState, type FormEvent } from "react";
import { redirect } from "react-router";

import { safe_next_path } from "../auth/next_path";
import { get_access_session } from "../auth/session.server";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in — Untangled" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safe_next_path(url.searchParams.get("next"), "/");
  const session = await get_access_session(request);
  if (session != null) {
    throw redirect(
      session.password_change_required ? "/expired-password" : next,
    );
  }
  return { next };
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { next } = loaderData;
  const [csrf, set_csrf] = useState("");
  const [error, set_error] = useState<string | null>(null);
  const [pending, set_pending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/auth/csrf", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("csrf");
        }
        const body: unknown = await response.json();
        const token =
          typeof body === "object" &&
          body != null &&
          "csrf_token" in body &&
          typeof body.csrf_token === "string"
            ? body.csrf_token
            : "";
        if (!cancelled) {
          set_csrf(token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          set_error("Unable to start sign-in. Refresh and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function on_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_error(null);
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    if (!username || !password) {
      set_error("Username and password are required.");
      return;
    }
    if (csrf === "") {
      set_error("Unable to start sign-in. Refresh and try again.");
      return;
    }
    set_pending(true);
    try {
      const response = await fetch("/api/v2/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "X-CSRF-Token": csrf,
        },
        body: new URLSearchParams({
          username,
          password,
          next,
          csrf_token: csrf,
        }),
      });
      if (response.status === 401) {
        set_error("Access denied.");
        return;
      }
      if (response.status === 403) {
        set_error(
          "Sign-in was blocked from this origin. Use the exact site address (localhost and 127.0.0.1 are different), then refresh.",
        );
        return;
      }
      if (response.status === 503) {
        let detail = "Sign-in is temporarily busy. Try again in a moment.";
        try {
          const payload: unknown = await response.json();
          if (
            typeof payload === "object" &&
            payload != null &&
            "detail" in payload &&
            typeof payload.detail === "string" &&
            payload.detail !== ""
          ) {
            detail = payload.detail;
          }
        } catch {
          // Keep the non-accusatory fallback when the body is missing.
        }
        set_error(detail);
        return;
      }
      if (!response.ok) {
        set_error("Sign-in failed. Try again.");
        return;
      }
      window.location.assign(next);
    } catch {
      set_error("Sign-in failed. Try again.");
    } finally {
      set_pending(false);
    }
  }

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

        <form method="post" className="space-y-4" onSubmit={on_submit}>
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

          {error != null && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || csrf === ""}
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
