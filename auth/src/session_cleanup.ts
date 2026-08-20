import type { Pool } from "pg";

import { SESSION_REFRESH_CLEANUP_DEFAULT } from "./session_settings.js";
import type { AuthRuntimeSettings } from "./system_config.js";

export const DELETE_USED_REFRESH_TOKEN_SQL =
  "DELETE FROM used_refresh_token WHERE expires_at <= $1";
export const DELETE_EXPIRED_USER_SESSION_SQL =
  "DELETE FROM user_session WHERE session_expires_at <= $1 OR refresh_expires_at <= $1";

export async function run_session_cleanup(
  pool: Pool,
  now: Date = new Date(),
): Promise<{ used_tokens: number; sessions: number }> {
  const used = await pool.query(DELETE_USED_REFRESH_TOKEN_SQL, [now]);
  const sessions = await pool.query(DELETE_EXPIRED_USER_SESSION_SQL, [now]);
  return {
    used_tokens: used.rowCount ?? 0,
    sessions: sessions.rowCount ?? 0,
  };
}

export function start_session_cleanup(args: {
  pool: Pool;
  get_settings: () => Promise<AuthRuntimeSettings>;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay_ms: number) => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      void tick();
    }, delay_ms);
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      await run_session_cleanup(args.pool);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      process.stderr.write(`untangled-auth session cleanup failed: ${message}\n`);
    }
    let delay_ms = SESSION_REFRESH_CLEANUP_DEFAULT * 1000;
    try {
      const settings = await args.get_settings();
      delay_ms = settings.session_refresh_cleanup_seconds * 1000;
    } catch {
      // Keep the YAML default delay until settings are readable again.
    }
    schedule(delay_ms);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
