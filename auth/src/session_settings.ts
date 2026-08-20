/** YAML-matching session_* bounds. Auth cache-load abort uses these; do not clamp. */

export const SESSION_ACCESS_TTL_MIN = 60;
export const SESSION_ACCESS_TTL_DEFAULT = 900;
export const SESSION_ACCESS_TTL_MAX = 86400;

export const SESSION_REFRESH_TTL_MIN = 300;
export const SESSION_REFRESH_TTL_DEFAULT = 604800;
export const SESSION_REFRESH_TTL_MAX = 7776000;

export const SESSION_TOTAL_TTL_MIN = 300;
export const SESSION_TOTAL_TTL_DEFAULT = 2592000;
export const SESSION_TOTAL_TTL_MAX = 15552000;

export const SESSION_REFRESH_REUSE_GRACE_MIN = 5;
export const SESSION_REFRESH_REUSE_GRACE_DEFAULT = 15;
export const SESSION_REFRESH_REUSE_GRACE_MAX = 60;

export const SESSION_REFRESH_REUSE_WINDOW_MIN = 3600;
export const SESSION_REFRESH_REUSE_WINDOW_DEFAULT = 86400;
export const SESSION_REFRESH_REUSE_WINDOW_MAX = 604800;

export const SESSION_MAX_REFRESH_RETRIES_MIN = 1;
export const SESSION_MAX_REFRESH_RETRIES_DEFAULT = 5;
export const SESSION_MAX_REFRESH_RETRIES_MAX = 10;

export const SESSION_REFRESH_CLEANUP_MIN = 3600;
export const SESSION_REFRESH_CLEANUP_DEFAULT = 14400;
export const SESSION_REFRESH_CLEANUP_MAX = 259200;

export const SESSION_REFRESH_PROCESS_TIME_MINIMUM_MIN = 100;
export const SESSION_REFRESH_PROCESS_TIME_MINIMUM_DEFAULT = 300;
export const SESSION_REFRESH_PROCESS_TIME_MINIMUM_MAX = 500;

export const SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MIN = 200;
export const SESSION_REFRESH_PROCESS_TIME_MAXIMUM_DEFAULT = 500;
export const SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MAX = 1000;

export type SessionIssueSettings = {
  session_access_ttl_seconds: number;
  session_refresh_ttl_seconds: number;
  session_total_ttl_seconds: number;
  session_refresh_reuse_grace_seconds: number;
  session_refresh_reuse_window_seconds: number;
  session_max_refresh_retries: number;
  session_refresh_cleanup_seconds: number;
  session_refresh_process_time_minimum: number;
  session_refresh_process_time_maximum: number;
};

export function default_session_issue_settings(): SessionIssueSettings {
  return {
    session_access_ttl_seconds: SESSION_ACCESS_TTL_DEFAULT,
    session_refresh_ttl_seconds: SESSION_REFRESH_TTL_DEFAULT,
    session_total_ttl_seconds: SESSION_TOTAL_TTL_DEFAULT,
    session_refresh_reuse_grace_seconds: SESSION_REFRESH_REUSE_GRACE_DEFAULT,
    session_refresh_reuse_window_seconds: SESSION_REFRESH_REUSE_WINDOW_DEFAULT,
    session_max_refresh_retries: SESSION_MAX_REFRESH_RETRIES_DEFAULT,
    session_refresh_cleanup_seconds: SESSION_REFRESH_CLEANUP_DEFAULT,
    session_refresh_process_time_minimum: SESSION_REFRESH_PROCESS_TIME_MINIMUM_DEFAULT,
    session_refresh_process_time_maximum: SESSION_REFRESH_PROCESS_TIME_MAXIMUM_DEFAULT,
  };
}

/** Client-facing soft-fail bound: 1–10, else the product default. */
export function session_max_refresh_retries_for_client(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SESSION_MAX_REFRESH_RETRIES_MIN &&
    value <= SESSION_MAX_REFRESH_RETRIES_MAX
  ) {
    return value;
  }
  return SESSION_MAX_REFRESH_RETRIES_DEFAULT;
}
