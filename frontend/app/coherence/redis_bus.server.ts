/**
 * Redis pub/sub coherence bus (Node / SSR server only).
 * Command client for publish; dedicated duplicate connection for subscribe.
 */
import { createClient, type RedisClientType } from "redis";

import { redact_redis_url } from "./redact";
import type { CoherenceBus, CoherenceHandler } from "./types";

export const DEFAULT_REDIS_URL = "redis://localhost:6379/0";

export function redis_url_from_env(
  raw: string | undefined = process.env.UNTANGLED_REDIS_URL,
): string {
  if (raw === undefined) {
    return DEFAULT_REDIS_URL;
  }
  const stripped = raw.trim();
  if (stripped === "") {
    throw new Error(
      "UNTANGLED_REDIS_URL is set but empty; set a redis:// URL or unset the variable to use the host default",
    );
  }
  return stripped;
}

export class RedisCoherenceBus implements CoherenceBus {
  private readonly url: string;
  private command: RedisClientType | null = null;

  constructor(url?: string) {
    this.url = url ?? redis_url_from_env();
  }

  private async command_client(): Promise<RedisClientType> {
    if (this.command != null && this.command.isOpen) {
      return this.command;
    }
    const client = createClient({ url: this.url }) as RedisClientType;
    client.on("error", (err: Error) => {
      // Avoid unhandled error events; callers surface failures on commands.
      console.error(
        `coherence redis command client error (${redact_redis_url(this.url)}):`,
        err.message,
      );
    });
    try {
      await client.connect();
    } catch (err) {
      throw new Error(
        `Redis unreachable for coherence publish (${redact_redis_url(this.url)})`,
        { cause: err },
      );
    }
    this.command = client;
    return client;
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    const client = await this.command_client();
    await client.publish(topic, JSON.stringify(payload));
  }

  async subscribe(
    topic: string,
    handler: CoherenceHandler,
  ): Promise<() => Promise<void>> {
    const subscriber = createClient({ url: this.url }) as RedisClientType;
    subscriber.on("error", (err: Error) => {
      console.error(
        `coherence redis subscriber error (${redact_redis_url(this.url)}):`,
        err.message,
      );
    });
    try {
      await subscriber.connect();
    } catch (err) {
      throw new Error(
        `Redis unreachable for coherence subscriber (${redact_redis_url(this.url)})`,
        { cause: err },
      );
    }

    await subscriber.subscribe(topic, (message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch {
        console.warn(`coherence message on ${topic} is not JSON; ignoring`);
        return;
      }
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn(`coherence message on ${topic} is not an object; ignoring`);
        return;
      }
      handler(parsed as Record<string, unknown>);
    });

    let stopped = false;
    return async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        await subscriber.unsubscribe(topic);
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

  async close(): Promise<void> {
    if (this.command != null && this.command.isOpen) {
      try {
        await this.command.quit();
      } catch {
        await this.command.disconnect();
      }
    }
    this.command = null;
  }
}
