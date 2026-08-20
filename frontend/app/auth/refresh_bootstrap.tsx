import { useEffect } from "react";

import { assign_login, run_refresh_attempts } from "./refresh_fetch";
import { safe_next_path } from "./next_path";

function replace_current_url(): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = safe_next_path(
    `${window.location.pathname}${window.location.search}`,
    "/",
  );
  window.location.replace(next);
}

/**
 * Same-origin document recovery: CSRF POST refresh, then location.replace.
 * Nested loaders must not fetch while this page is showing.
 */
export function RefreshBootstrap() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await run_refresh_attempts();
      if (cancelled) {
        return;
      }
      if (result === "ok") {
        replace_current_url();
        return;
      }
      assign_login();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <p className="text-sm text-slate-600">Refreshing your session…</p>
    </main>
  );
}
