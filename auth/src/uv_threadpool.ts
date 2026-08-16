import { LOGIN_HASH_CONCURRENCY_MAX } from "./login_settings.js";

/** UV threads reserved for audit fsync and JWT/CSRF crypto beside hashes. */
export const UV_THREADPOOL_HEADROOM = 2;

export const UV_THREADPOOL_MIN =
  LOGIN_HASH_CONCURRENCY_MAX + UV_THREADPOOL_HEADROOM;

/** Raise UV_THREADPOOL_SIZE to at least max hash slots + headroom before any pool work. */
export function ensure_uv_threadpool(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.UV_THREADPOOL_SIZE?.trim() ?? "";
  const current = raw === "" ? Number.NaN : Number(raw);
  const size =
    Number.isInteger(current) && current >= UV_THREADPOOL_MIN
      ? current
      : UV_THREADPOOL_MIN;
  env.UV_THREADPOOL_SIZE = String(size);
  return size;
}
