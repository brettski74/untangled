import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_RATE_LIMIT_TRIP } from "../src/audit.js";
import { memory_audit_sink } from "../src/audit.js";
import {
  default_rate_limit_settings,
  INVALID_OR_OVERSIZE,
  type RateLimitSettings,
} from "../src/login_settings.js";
import {
  CONTEXT_BASE_BYTES,
  FAILURE_MEMBER_BYTES,
  evaluate_context,
  make_memory_rate_limit,
  record_on_context,
  type ContextParams,
} from "../src/rate_limit.js";

const tight: ContextParams = {
  threshold: 1,
  sample_period_s: 10,
  l1_delay_ms: 500,
  l2_delay_ms: 2000,
  lockout_s: 20,
};

function settings(overrides: Partial<RateLimitSettings> = {}): RateLimitSettings {
  return { ...default_rate_limit_settings(), ...overrides };
}

describe("evaluate_context", () => {
  it("missing context returns delay 0 and does not allocate", () => {
    const outcome = evaluate_context(null, 1_000, tight);
    assert.equal(outcome.delay_ms, 0);
    assert.equal(outcome.lockout, false);
    assert.equal(outcome.next, null);
  });

  it("returns D1 when N1 exceeds Th, D2 when N2 exceeds 2Th without stacking D1", () => {
    const now = 10_000;
    const d1 = evaluate_context(
      {
        lockout_until_ms: null,
        grace_until_ms: null,
        failures_ms: [now - 1_000, now - 2_000],
      },
      now,
      tight,
    );
    assert.equal(d1.delay_ms, 500);
    assert.equal(d1.lockout, false);

    const d2 = evaluate_context(
      {
        lockout_until_ms: null,
        grace_until_ms: null,
        failures_ms: [now - 1_000, now - 11_000, now - 12_000],
      },
      now,
      tight,
    );
    assert.equal(d2.delay_ms, 2000);
    assert.equal(d2.lockout, false);
  });

  it("lockout check precedes N-counts and returns D2", () => {
    const now = 50_000;
    const outcome = evaluate_context(
      {
        lockout_until_ms: now + 5_000,
        grace_until_ms: now + 25_000,
        failures_ms: [],
      },
      now,
      tight,
    );
    assert.equal(outcome.lockout, true);
    assert.equal(outcome.delay_ms, 2000);
    assert.equal(outcome.lockout_started, false);
  });

  it("N3 above 3Th starts lockout and grace", () => {
    const now = 1_000;
    const outcome = evaluate_context(
      {
        lockout_until_ms: null,
        grace_until_ms: null,
        failures_ms: [now, now, now, now],
      },
      now,
      tight,
    );
    assert.equal(outcome.lockout, true);
    assert.equal(outcome.delay_ms, 2000);
    assert.equal(outcome.lockout_started, true);
    assert.equal(outcome.next?.lockout_until_ms, now + 20_000);
    assert.equal(outcome.next?.grace_until_ms, now + 40_000);
  });

  it("grace blocks a new lockout but still applies D1/D2", () => {
    const now = 1_000;
    const outcome = evaluate_context(
      {
        lockout_until_ms: now - 1,
        grace_until_ms: now + 10_000,
        failures_ms: [now, now, now, now],
      },
      now,
      tight,
    );
    assert.equal(outcome.lockout, false);
    assert.equal(outcome.lockout_started, false);
    assert.equal(outcome.delay_ms, 2000);
    assert.equal(outcome.next?.lockout_until_ms, now - 1);
  });

  it("prunes timestamps older than 3S", () => {
    const now = 100_000;
    const outcome = evaluate_context(
      {
        lockout_until_ms: null,
        grace_until_ms: null,
        failures_ms: [now - 31_000, now - 1_000],
      },
      now,
      tight,
    );
    assert.deepEqual(outcome.next?.failures_ms, [now - 1_000]);
  });
});

describe("memory rate-limit evaluator", () => {
  it("does not create keys on evaluate of a never-failed identity", async () => {
    const rl = make_memory_rate_limit({ now_ms: () => 1_000 });
    const result = await rl.evaluate("admin", "203.0.113.9");
    assert.deepEqual(result, { delay_ms: 0, lockout: false });
    assert.equal(rl.contexts.size, 0);
  });

  it("record_failure lazy-creates user and IP contexts", async () => {
    const rl = make_memory_rate_limit({ now_ms: () => 1_000 });
    await rl.record_failure("admin", "203.0.113.9");
    assert.equal(rl.contexts.size, 2);
    await rl.record_failure(INVALID_OR_OVERSIZE, "198.51.100.10");
    assert.ok(rl.contexts.has(`user\t${INVALID_OR_OVERSIZE}`));
    assert.equal(rl.contexts.has("user\tab"), false);
  });

  it("skips IP context when source_ip is missing", async () => {
    const rl = make_memory_rate_limit({ now_ms: () => 1_000 });
    await rl.record_failure("admin", undefined);
    const result = await rl.evaluate("admin", undefined);
    assert.equal(rl.contexts.size, 1);
    assert.equal(result.delay_ms, 0);
  });

  it("adds username and IP delays", async () => {
    let now = 0;
    const rl = make_memory_rate_limit({
      now_ms: () => now,
      get_settings: () =>
        settings({
          per_user_threshold: 1,
          per_ip_threshold: 1,
          per_user_sample_period_s: 10,
          per_ip_sample_period_s: 10,
        }),
    });
    now = 1_000;
    await rl.record_failure("admin", "203.0.113.9");
    await rl.record_failure("admin", "203.0.113.9");
    await rl.record_failure("other", "203.0.113.9");
    const result = await rl.evaluate("admin", "203.0.113.9");
    assert.equal(result.delay_ms, 500 + 2000);
    assert.equal(result.lockout, false);
  });

  it("evaluate does not sleep", async () => {
    const rl = make_memory_rate_limit({ now_ms: () => 1 });
    const started = Date.now();
    await rl.evaluate("admin", "203.0.113.9");
    assert.ok(Date.now() - started < 50);
  });

  it("emits auth.rate_limit_trip once when lockout starts", async () => {
    const sink_events: Parameters<typeof memory_audit_sink>[0] = [];
    const audit = memory_audit_sink(sink_events);
    let now = 0;
    const rl = make_memory_rate_limit({
      audit,
      now_ms: () => now,
      get_settings: () =>
        settings({
          per_user_threshold: 1,
          per_user_sample_period_s: 10,
          lockout_s: 20,
        }),
    });
    now = 1_000;
    for (let i = 0; i < 4; i += 1) {
      await rl.record_failure("admin", "203.0.113.9");
    }
    const first = await rl.evaluate("admin", "203.0.113.9");
    assert.equal(first.lockout, true);
    assert.equal(sink_events.filter((e) => e.event_type === AUTH_RATE_LIMIT_TRIP).length, 1);
    const second = await rl.evaluate("admin", "203.0.113.9");
    assert.equal(second.lockout, true);
    assert.equal(sink_events.filter((e) => e.event_type === AUTH_RATE_LIMIT_TRIP).length, 1);
  });

  it("trip emit failure does not block lockout", async () => {
    let now = 0;
    const rl = make_memory_rate_limit({
      audit: {
        async emit() {
          throw new Error("audit down");
        },
      },
      now_ms: () => now,
      get_settings: () =>
        settings({
          per_user_threshold: 1,
          per_user_sample_period_s: 10,
          lockout_s: 20,
        }),
    });
    now = 1_000;
    for (let i = 0; i < 4; i += 1) {
      await rl.record_failure("admin", undefined);
    }
    const result = await rl.evaluate("admin", undefined);
    assert.equal(result.lockout, true);
  });

  it("purges empty expired contexts and keeps active lockout", async () => {
    let now = 100_000;
    const rl = make_memory_rate_limit({
      now_ms: () => now,
      get_settings: () =>
        settings({ per_user_sample_period_s: 10, lockout_s: 20 }),
    });
    rl.contexts.set("user\tstale", {
      lockout_until_ms: null,
      grace_until_ms: null,
      failures_ms: [now - 40_000],
    });
    rl.contexts.set("user\tlocked", {
      lockout_until_ms: now + 5_000,
      grace_until_ms: now + 25_000,
      failures_ms: [],
    });
    rl.run_purge();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rl.contexts.has("user\tstale"), false);
    assert.equal(rl.contexts.has("user\tlocked"), true);
  });

  it("schedules one purge above 80% and refuses new contexts at budget", async () => {
    const queued: Array<() => void> = [];
    const max_kib = 1;
    const rl = make_memory_rate_limit({
      now_ms: () => 1_000,
      schedule: (task) => queued.push(task),
      get_settings: () => settings({ max_kib }),
    });
    const budget = max_kib * 1024;
    const per_context = CONTEXT_BASE_BYTES + FAILURE_MEMBER_BYTES;
    const to_create = Math.floor(budget / per_context) + 2;
    for (let i = 0; i < to_create; i += 1) {
      await rl.record_failure(`u${i}`, undefined);
    }
    assert.ok(queued.length >= 1);
    const scheduled = queued.length;
    await rl.record_failure("another", undefined);
    assert.equal(queued.length, scheduled);
    const locked_before = rl.contexts.size;
    await rl.record_failure("flood", undefined);
    assert.equal(rl.contexts.size, locked_before);
    assert.equal(rl.contexts.has("user\tflood"), false);
  });

  it("unique-key flood does not strip an active lockout", async () => {
    let now = 1_000;
    const rl = make_memory_rate_limit({
      now_ms: () => now,
      schedule: () => undefined,
      get_settings: () =>
        settings({
          max_kib: 1,
          per_user_threshold: 1,
          per_user_sample_period_s: 10,
          lockout_s: 20,
        }),
    });
    for (let i = 0; i < 4; i += 1) {
      await rl.record_failure("victim", undefined);
    }
    const locked = await rl.evaluate("victim", undefined);
    assert.equal(locked.lockout, true);
    const budget = 1024;
    const per_context = CONTEXT_BASE_BYTES + FAILURE_MEMBER_BYTES;
    const to_create = Math.floor(budget / per_context) + 8;
    for (let i = 0; i < to_create; i += 1) {
      await rl.record_failure(`flood${i}`, undefined);
    }
    const still = await rl.evaluate("victim", undefined);
    assert.equal(still.lockout, true);
    assert.ok(rl.contexts.has("user\tvictim"));
  });
});

describe("record_on_context", () => {
  it("appends a failure timestamp and creates empty state", () => {
    const created = record_on_context(null, 42);
    assert.deepEqual(created.failures_ms, [42]);
    const next = record_on_context(created, 43);
    assert.deepEqual(next.failures_ms, [42, 43]);
  });
});
