import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createClient } from "redis";

import { default_rate_limit_settings } from "../src/login_settings.js";
import { make_redis_rate_limit, RL_KEY_PREFIX } from "../src/rate_limit_redis.js";
import { DEFAULT_REDIS_URL, redis_url_from_env, redact_redis_url } from "../src/redis_url.js";

describe("redis_url", () => {
  it("defaults to localhost when unset", () => {
    assert.equal(DEFAULT_REDIS_URL, "redis://localhost:6379/0");
    assert.equal(redis_url_from_env(undefined), DEFAULT_REDIS_URL);
  });

  it("fails closed on an explicit empty value", () => {
    assert.throws(() => redis_url_from_env(""), /empty/);
    assert.throws(() => redis_url_from_env("  "), /empty/);
  });

  it("redacts passwords without using a numeric loopback literal in the helper default", () => {
    assert.equal(
      redact_redis_url("redis://:s3cret@localhost:6379/0"),
      "redis://localhost:6379/0",
    );
    assert.equal(redact_redis_url("redis://user:s3cret@host:6379/1").includes("s3cret"), false);
  });
});

describe("redis rate-limit adapter", () => {
  it("round-trips evaluate and record_failure on live Redis", async (t) => {
    const url = process.env.UNTANGLED_REDIS_URL ?? DEFAULT_REDIS_URL;
    const client = createClient({ url });
    client.on("error", () => undefined);
    try {
      await client.connect();
    } catch {
      t.skip("Redis not reachable");
      return;
    }
    const suffix = randomUUID();
    const username = `t214_${suffix}`;
    const ip = `203.0.113.${suffix.slice(0, 2)}`;
    const rl = make_redis_rate_limit({
      client,
      get_settings: async () =>
        default_rate_limit_settings(),
      now_ms: () => 1_000,
    });
    try {
      const before = await rl.evaluate(username, ip);
      assert.deepEqual(before, { delay_ms: 0, lockout: false });
      await rl.record_failure(username, ip);
      const hash = await client.exists(`${RL_KEY_PREFIX}u:${encodeURIComponent(username)}`);
      assert.equal(hash, 1);
      const again = await rl.evaluate(username, ip);
      assert.equal(again.lockout, false);
    } finally {
      const user_hash = `${RL_KEY_PREFIX}u:${encodeURIComponent(username)}`;
      const ip_hash = `${RL_KEY_PREFIX}i:${encodeURIComponent(ip)}`;
      await client.del([user_hash, `${user_hash}:z`, ip_hash, `${ip_hash}:z`]);
      await client.quit();
    }
  });
});
