import { createClient, type RedisClientType } from "redis";

import { redact_redis_url } from "./redis_url.js";
import type { LoginSettingsSource } from "./system_config.js";

export const SYSTEM_CONFIG_INVALIDATE_TOPIC =
  "untangled.coherence.system_config.invalidate";

export async function start_system_config_subscriber(args: {
  redis_url: string;
  cache: LoginSettingsSource;
}): Promise<() => Promise<void>> {
  const subscriber = createClient({ url: args.redis_url }) as RedisClientType;
  subscriber.on("error", (error: Error) => {
    process.stderr.write(
      `untangled-auth coherence subscriber error (${redact_redis_url(args.redis_url)}): ${error.message}\n`,
    );
  });
  try {
    await subscriber.connect();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(
      `Redis unreachable for auth system_config subscribe (${redact_redis_url(args.redis_url)}): ${message}`,
      { cause: error },
    );
  }
  await subscriber.subscribe(SYSTEM_CONFIG_INVALIDATE_TOPIC, () => {
    args.cache.invalidate();
  });
  let stopped = false;
  return async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    try {
      await subscriber.unsubscribe(SYSTEM_CONFIG_INVALIDATE_TOPIC);
    } catch {
      /* ignore */
    }
    try {
      await subscriber.quit();
    } catch {
      try {
        await subscriber.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}
