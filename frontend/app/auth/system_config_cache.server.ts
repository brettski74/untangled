/**
 * Process-local TTL cache of the system_config singleton for SSR.
 * Filled via the domain GET (must-change tokens may only hit this path).
 * Coherence subscribe flushes on peer writes.
 */
import {
  RedisCoherenceBus,
  redis_url_from_env,
} from "../coherence/redis_bus.server";
import { SYSTEM_CONFIG_INVALIDATE_TOPIC } from "../coherence/topics";
import { SYSTEM_CONFIG_ID } from "../generated/well_known";
import { fetch_record, type RecordResponse } from "../records/fetch.server";

type CacheEntry = {
  record: RecordResponse;
  expires_at_ms: number;
};

let entry: CacheEntry | null = null;
let subscribe_started: Promise<void> | null = null;

export function invalidate_system_config_cache(): void {
  entry = null;
}

export async function get_cached_system_config(
  access_token: string,
): Promise<RecordResponse> {
  const now = Date.now();
  if (entry != null && now < entry.expires_at_ms) {
    return entry.record;
  }
  const record = await fetch_record(
    access_token,
    "system_config",
    SYSTEM_CONFIG_ID,
  );
  const ttl_raw = record.system_config_cache_ttl_seconds;
  const ttl =
    typeof ttl_raw === "number" && Number.isFinite(ttl_raw) && ttl_raw > 0
      ? ttl_raw
      : 900;
  entry = { record, expires_at_ms: now + ttl * 1000 };
  return record;
}

export function ensure_system_config_subscriber(): Promise<void> {
  if (process.env.VITEST) {
    return Promise.resolve();
  }
  if (subscribe_started == null) {
    subscribe_started = (async () => {
      const bus = new RedisCoherenceBus(redis_url_from_env());
      await bus.subscribe(SYSTEM_CONFIG_INVALIDATE_TOPIC, () => {
        invalidate_system_config_cache();
      });
    })();
  }
  return subscribe_started;
}
