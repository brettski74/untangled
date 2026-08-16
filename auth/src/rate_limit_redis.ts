import { createClient } from "redis";

import type { AuditSink } from "./audit.js";
import { rate_limit_trip_audit_event } from "./audit.js";
import type { RateLimitSettings } from "./login_settings.js";
import {
  WATCH_RETRY_LIMIT,
  budget_bytes,
  context_is_expired,
  empty_context,
  estimate_context_bytes,
  evaluate_context,
  ip_params,
  prune_failures,
  record_on_context,
  user_params,
  type ContextKind,
  type ContextState,
  type RateLimitEvaluator,
  type RateLimitResult,
} from "./rate_limit.js";
import { redact_redis_url } from "./redis_url.js";

type AuthRedisClient = ReturnType<typeof createClient>;
type AuthRedisMulti = ReturnType<AuthRedisClient["multi"]>;

export const RL_KEY_PREFIX = "auth:rl:";
const META_BYTES = `${RL_KEY_PREFIX}meta:bytes`;
const META_PURGE = `${RL_KEY_PREFIX}meta:purge`;
const PURGE_LOCK_SECONDS = 30;
const SCAN_COUNT = 64;

function encode_id(key: string): string {
  return encodeURIComponent(key);
}

function hash_key(kind: ContextKind, key: string): string {
  const bucket = kind === "user" ? "u" : "i";
  return `${RL_KEY_PREFIX}${bucket}:${encode_id(key)}`;
}

function zset_key(kind: ContextKind, key: string): string {
  return `${hash_key(kind, key)}:z`;
}

function parse_hash_key(raw: string): { kind: ContextKind; key: string } | null {
  if (raw.endsWith(":z") || raw.startsWith(`${RL_KEY_PREFIX}meta:`)) {
    return null;
  }
  const user_prefix = `${RL_KEY_PREFIX}u:`;
  const ip_prefix = `${RL_KEY_PREFIX}i:`;
  if (raw.startsWith(user_prefix)) {
    return { kind: "user", key: decodeURIComponent(raw.slice(user_prefix.length)) };
  }
  if (raw.startsWith(ip_prefix)) {
    return { kind: "ip", key: decodeURIComponent(raw.slice(ip_prefix.length)) };
  }
  return null;
}

function parse_optional_ms(raw: string | undefined): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

async function load_state(
  client: AuthRedisClient,
  kind: ContextKind,
  key: string,
): Promise<ContextState | null> {
  const hash = hash_key(kind, key);
  const zset = zset_key(kind, key);
  const exists = await client.exists(hash);
  if (exists === 0) {
    return null;
  }
  const fields = await client.hGetAll(hash);
  const members = await client.zRangeWithScores(zset, 0, -1);
  return {
    lockout_until_ms: parse_optional_ms(fields.lockout_until),
    grace_until_ms: parse_optional_ms(fields.grace_until),
    failures_ms: members.map((entry) => entry.score),
  };
}

function write_state(
  multi: AuthRedisMulti,
  kind: ContextKind,
  key: string,
  state: ContextState,
): void {
  const hash = hash_key(kind, key);
  const zset = zset_key(kind, key);
  multi.hSet(hash, {
    lockout_until:
      state.lockout_until_ms == null ? "" : String(state.lockout_until_ms),
    grace_until: state.grace_until_ms == null ? "" : String(state.grace_until_ms),
  });
  multi.del(zset);
  if (state.failures_ms.length > 0) {
    multi.zAdd(
      zset,
      state.failures_ms.map((stamp, index) => ({
        score: stamp,
        value: `${stamp}:${index}`,
      })),
    );
  }
}

async function read_bytes(client: AuthRedisClient): Promise<number> {
  const raw = await client.get(META_BYTES);
  const value = Number(raw ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function emit_trip_safe(
  audit: AuditSink | undefined,
  kind: ContextKind,
  context_key: string,
  source_ip: string | undefined,
): void {
  if (audit == null) {
    return;
  }
  void audit
    .emit(
      rate_limit_trip_audit_event({
        kind,
        context_key,
        ip_address: source_ip,
      }),
    )
    .catch(() => undefined);
}

export function make_redis_rate_limit(options: {
  client: AuthRedisClient;
  get_settings: () => Promise<RateLimitSettings>;
  audit?: AuditSink;
  now_ms?: () => number;
  schedule?: (task: () => void) => void;
  redis_url?: string;
}): RateLimitEvaluator {
  const client = options.client;
  const now_ms = options.now_ms ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((task: () => void) => {
      setImmediate(task);
    });
  let local_purge_running = false;
  let exclusive: Promise<void> = Promise.resolve();

  function run_exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = exclusive.then(fn, fn);
    exclusive = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function is_watch_conflict(error: unknown): boolean {
    if (error == null) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /watch/i.test(message);
  }

  async function with_watch<T>(
    keys: string[],
    body: (conn: AuthRedisClient) => Promise<{
      result: T;
      apply: (multi: AuthRedisMulti) => void;
    }>,
  ): Promise<T> {
    return run_exclusive(async () => {
      let last_error: unknown;
      for (let attempt = 0; attempt < WATCH_RETRY_LIMIT; attempt += 1) {
        try {
          await client.watch(keys);
          const prepared = await body(client);
          const multi = client.multi();
          prepared.apply(multi);
          const exec_result = await multi.exec();
          if (exec_result === null) {
            throw new Error("watch conflict");
          }
          return prepared.result;
        } catch (error: unknown) {
          last_error = error;
          try {
            await client.unwatch();
          } catch {
            // connection may already have cleared WATCH
          }
          if (is_watch_conflict(error) && attempt + 1 < WATCH_RETRY_LIMIT) {
            continue;
          }
          throw error;
        }
      }
      const detail = last_error instanceof Error ? last_error.message : "unknown";
      throw new Error(`rate-limit watch retries exhausted (${detail})`);
    });
  }

  async function eval_one(
    kind: ContextKind,
    key: string,
    settings: RateLimitSettings,
    source_ip: string | undefined,
  ): Promise<RateLimitResult> {
    const params = kind === "user" ? user_params(settings) : ip_params(settings);
    const keys = [hash_key(kind, key), zset_key(kind, key)];
    const committed = await with_watch(keys, async (isolated) => {
      const existing = await load_state(isolated, kind, key);
      const outcome = evaluate_context(existing, now_ms(), params);
      return {
        result: {
          delay_ms: outcome.delay_ms,
          lockout: outcome.lockout,
          lockout_started: outcome.lockout_started,
        },
        apply(multi) {
          if (outcome.next != null) {
            const previous_bytes = existing == null ? 0 : estimate_context_bytes(existing);
            const next_bytes = estimate_context_bytes(outcome.next);
            write_state(multi, kind, key, outcome.next);
            if (next_bytes !== previous_bytes) {
              multi.incrBy(META_BYTES, next_bytes - previous_bytes);
            }
          }
        },
      };
    });
    if (committed.lockout_started) {
      emit_trip_safe(options.audit, kind, key, source_ip);
    }
    return { delay_ms: committed.delay_ms, lockout: committed.lockout };
  }

  async function record_one(
    kind: ContextKind,
    key: string,
    settings: RateLimitSettings,
  ): Promise<void> {
    const keys = [hash_key(kind, key), zset_key(kind, key)];
    await with_watch(keys, async (isolated) => {
      const existing = await load_state(isolated, kind, key);
      const used = await read_bytes(isolated);
      if (existing == null && used >= budget_bytes(settings.max_kib)) {
        return {
          result: undefined,
          apply() {},
        };
      }
      const next = record_on_context(existing ?? empty_context(), now_ms());
      const previous_bytes = existing == null ? 0 : estimate_context_bytes(existing);
      const next_bytes = estimate_context_bytes(next);
      return {
        result: undefined,
        apply(multi) {
          write_state(multi, kind, key, next);
          multi.incrBy(META_BYTES, next_bytes - previous_bytes);
        },
      };
    });
  }

  function yield_loop(): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  }

  async function purge_one(
    kind: ContextKind,
    key: string,
    settings: RateLimitSettings,
  ): Promise<number> {
    const params = kind === "user" ? user_params(settings) : ip_params(settings);
    const keys = [hash_key(kind, key), zset_key(kind, key)];
    return with_watch(keys, async (isolated) => {
      const existing = await load_state(isolated, kind, key);
      if (existing == null) {
        return { result: 0, apply() {} };
      }
      const now = now_ms();
      const pruned: ContextState = {
        ...existing,
        failures_ms: prune_failures(
          existing.failures_ms,
          now,
          params.sample_period_s,
        ),
      };
      if (context_is_expired(pruned, now)) {
        const previous_bytes = estimate_context_bytes(existing);
        return {
          result: 0,
          apply(multi) {
            multi.del([hash_key(kind, key), zset_key(kind, key)]);
            if (previous_bytes !== 0) {
              multi.incrBy(META_BYTES, -previous_bytes);
            }
          },
        };
      }
      const previous_bytes = estimate_context_bytes(existing);
      const next_bytes = estimate_context_bytes(pruned);
      return {
        result: next_bytes,
        apply(multi) {
          write_state(multi, kind, key, pruned);
          if (next_bytes !== previous_bytes) {
            multi.incrBy(META_BYTES, next_bytes - previous_bytes);
          }
        },
      };
    });
  }

  async function run_purge(settings: RateLimitSettings): Promise<void> {
    const locked = await client.set(META_PURGE, "1", {
      NX: true,
      EX: PURGE_LOCK_SECONDS,
    });
    if (locked !== "OK") {
      local_purge_running = false;
      return;
    }
    try {
      let cursor = "0";
      do {
        const reply = await client.scan(cursor, {
          MATCH: `${RL_KEY_PREFIX}[ui]:*`,
          COUNT: SCAN_COUNT,
        });
        cursor = String(reply.cursor);
        for (const raw of reply.keys) {
          const parsed = parse_hash_key(raw);
          if (parsed == null) {
            continue;
          }
          await purge_one(parsed.kind, parsed.key, settings);
        }
        await yield_loop();
      } while (cursor !== "0");
    } finally {
      await client.del(META_PURGE);
      local_purge_running = false;
    }
  }

  function maybe_schedule_purge(settings: RateLimitSettings, used: number): void {
    if (used <= budget_bytes(settings.max_kib) * 0.8) {
      return;
    }
    if (local_purge_running) {
      return;
    }
    local_purge_running = true;
    schedule(() => {
      void run_purge(settings).catch((error: unknown) => {
        local_purge_running = false;
        const message = error instanceof Error ? error.message : "unknown";
        const url = options.redis_url ?? "";
        process.stderr.write(
          `untangled-auth rate-limit purge failed (${redact_redis_url(url)}): ${message}\n`,
        );
      });
    });
  }

  return {
    async evaluate(username_key, source_ip) {
      const settings = await options.get_settings();
      const user = await eval_one("user", username_key, settings, source_ip);
      let ip: RateLimitResult = { delay_ms: 0, lockout: false };
      if (source_ip != null && source_ip !== "") {
        ip = await eval_one("ip", source_ip, settings, source_ip);
      }
      return {
        delay_ms: user.delay_ms + ip.delay_ms,
        lockout: user.lockout || ip.lockout,
      };
    },
    async record_failure(username_key, source_ip) {
      const settings = await options.get_settings();
      await record_one("user", username_key, settings);
      if (source_ip != null && source_ip !== "") {
        await record_one("ip", source_ip, settings);
      }
      const used = await read_bytes(client);
      maybe_schedule_purge(settings, used);
    },
  };
}
