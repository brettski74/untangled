/**
 * Cache-coherence / invalidation signaling for the web tier.
 *
 * Redis pub/sub MVP for cross-process flush signals. This is **not** a domain
 * workflow bus, audit channel, or durable queue. Best-effort / at-most-once;
 * no replay. The web process subscribes on boot to flush the system_config TTL
 * cache used by change-password / expired-password pages.
 */

export {
  SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
  SYSTEM_CONFIG_INVALIDATE_TOPIC,
} from "./topics";
export type { CoherenceBus, CoherenceHandler } from "./types";
export { redact_redis_url } from "./redact";
export { RedisCoherenceBus, redis_url_from_env } from "./redis_bus.server";
