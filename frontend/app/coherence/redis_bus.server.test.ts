import { afterEach, describe, expect, it } from "vitest";

import { redact_redis_url } from "./redact";
import {
  DEFAULT_REDIS_URL,
  RedisCoherenceBus,
  redis_url_from_env,
} from "./redis_bus.server";
import {
  SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
  SYSTEM_CONFIG_INVALIDATE_TOPIC,
} from "./topics";

describe("redact_redis_url", () => {
  it("strips passwords from redis URLs", () => {
    expect(redact_redis_url("redis://:s3cret@127.0.0.1:6379/0")).not.toContain(
      "s3cret",
    );
    expect(redact_redis_url("redis://user:s3cret@host:6379/1")).toContain("user");
    expect(redact_redis_url("redis://user:s3cret@host:6379/1")).not.toContain(
      "s3cret",
    );
  });
});

describe("redis_url_from_env", () => {
  const previous = process.env.UNTANGLED_REDIS_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.UNTANGLED_REDIS_URL;
    } else {
      process.env.UNTANGLED_REDIS_URL = previous;
    }
  });

  it("rejects empty URL", () => {
    process.env.UNTANGLED_REDIS_URL = "  ";
    expect(() => redis_url_from_env()).toThrow(/empty/);
  });

  it("defaults to localhost when unset", () => {
    delete process.env.UNTANGLED_REDIS_URL;
    expect(DEFAULT_REDIS_URL).toBe("redis://localhost:6379/0");
    expect(redis_url_from_env()).toBe(DEFAULT_REDIS_URL);
  });
});

describe("RedisCoherenceBus subscribe path", () => {
  it("receives a published coherence signal over Redis", async () => {
    const url = process.env.UNTANGLED_REDIS_URL ?? DEFAULT_REDIS_URL;
    const bus = new RedisCoherenceBus(url);
    const topic = `${SYSTEM_CONFIG_INVALIDATE_TOPIC}.ci.${Date.now()}`;
    const received: Record<string, unknown>[] = [];

    let stop: (() => Promise<void>) | undefined;
    try {
      stop = await bus.subscribe(topic, (payload) => {
        received.push(payload);
      });
      // Brief pause so subscribe is registered before publish.
      await new Promise((r) => setTimeout(r, 50));
      await bus.publish(topic, {
        ...SYSTEM_CONFIG_INVALIDATE_PAYLOAD,
        probe: "frontend",
      });

      const deadline = Date.now() + 2000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(received).toEqual([
        { ...SYSTEM_CONFIG_INVALIDATE_PAYLOAD, probe: "frontend" },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unreachable|ECONNREFUSED|ENOTFOUND/i.test(message)) {
        // Host frontend-test alone may not have started Redis; make test runs
        // backend-test first (redis-up). Skip rather than false-fail.
        console.warn(`skipping Redis coherence test: ${message}`);
        return;
      }
      throw err;
    } finally {
      if (stop) {
        await stop();
      }
      await bus.close();
    }
  }, 10_000);
});
