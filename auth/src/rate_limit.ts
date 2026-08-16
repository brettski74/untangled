import type { AuditSink } from "./audit.js";
import { rate_limit_trip_audit_event } from "./audit.js";
import {
  default_rate_limit_settings,
  type RateLimitSettings,
} from "./login_settings.js";

export type RateLimitResult = {
  delay_ms: number;
  lockout: boolean;
};

export type RateLimitEvaluator = {
  evaluate: (
    username_key: string,
    source_ip: string | undefined,
  ) => RateLimitResult | Promise<RateLimitResult>;
  record_failure: (
    username_key: string,
    source_ip: string | undefined,
  ) => void | Promise<void>;
};

export type ContextKind = "user" | "ip";

export type ContextState = {
  lockout_until_ms: number | null;
  grace_until_ms: number | null;
  failures_ms: number[];
};

export type ContextParams = {
  threshold: number;
  sample_period_s: number;
  l1_delay_ms: number;
  l2_delay_ms: number;
  lockout_s: number;
};

export const CONTEXT_BASE_BYTES = 256;
export const FAILURE_MEMBER_BYTES = 64;
export const WATCH_RETRY_LIMIT = 8;
export const PURGE_TRIGGER_RATIO = 0.8;

export function empty_context(): ContextState {
  return { lockout_until_ms: null, grace_until_ms: null, failures_ms: [] };
}

export function prune_failures(
  failures_ms: number[],
  now_ms: number,
  sample_period_s: number,
): number[] {
  const cutoff = now_ms - 3 * sample_period_s * 1000;
  return failures_ms.filter((stamp) => stamp >= cutoff);
}

export function context_is_expired(
  state: ContextState,
  now_ms: number,
): boolean {
  const lockout_done =
    state.lockout_until_ms == null || now_ms >= state.lockout_until_ms;
  const grace_done =
    state.grace_until_ms == null || now_ms >= state.grace_until_ms;
  return state.failures_ms.length === 0 && lockout_done && grace_done;
}

export function estimate_context_bytes(state: ContextState): number {
  return CONTEXT_BASE_BYTES + state.failures_ms.length * FAILURE_MEMBER_BYTES;
}

export function budget_bytes(max_kib: number): number {
  return max_kib * 1024;
}

export type EvaluateContextResult = {
  delay_ms: number;
  lockout: boolean;
  next: ContextState | null;
  lockout_started: boolean;
};

export function evaluate_context(
  state: ContextState | null,
  now_ms: number,
  params: ContextParams,
): EvaluateContextResult {
  if (state == null) {
    return {
      delay_ms: 0,
      lockout: false,
      next: null,
      lockout_started: false,
    };
  }

  const failures_ms = prune_failures(
    state.failures_ms,
    now_ms,
    params.sample_period_s,
  );
  let lockout_until_ms = state.lockout_until_ms;
  let grace_until_ms = state.grace_until_ms;

  if (lockout_until_ms != null && now_ms < lockout_until_ms) {
    return {
      delay_ms: params.l2_delay_ms,
      lockout: true,
      next: { lockout_until_ms, grace_until_ms, failures_ms },
      lockout_started: false,
    };
  }

  const in_grace = grace_until_ms != null && now_ms < grace_until_ms;
  const window_s = params.sample_period_s * 1000;
  const n1 = failures_ms.filter((stamp) => stamp >= now_ms - window_s).length;
  const n2 = failures_ms.filter((stamp) => stamp >= now_ms - 2 * window_s).length;
  const n3 = failures_ms.length;

  if (n3 > 3 * params.threshold && !in_grace) {
    lockout_until_ms = now_ms + params.lockout_s * 1000;
    grace_until_ms = lockout_until_ms + params.lockout_s * 1000;
    return {
      delay_ms: params.l2_delay_ms,
      lockout: true,
      next: { lockout_until_ms, grace_until_ms, failures_ms },
      lockout_started: true,
    };
  }

  const next: ContextState = {
    lockout_until_ms,
    grace_until_ms,
    failures_ms,
  };
  if (n2 > 2 * params.threshold) {
    return {
      delay_ms: params.l2_delay_ms,
      lockout: false,
      next,
      lockout_started: false,
    };
  }
  if (n1 > params.threshold) {
    return {
      delay_ms: params.l1_delay_ms,
      lockout: false,
      next,
      lockout_started: false,
    };
  }
  return { delay_ms: 0, lockout: false, next, lockout_started: false };
}

export function record_on_context(
  state: ContextState | null,
  now_ms: number,
): ContextState {
  const base = state ?? empty_context();
  return {
    ...base,
    failures_ms: [...base.failures_ms, now_ms],
  };
}

export function user_params(settings: RateLimitSettings): ContextParams {
  return {
    threshold: settings.per_user_threshold,
    sample_period_s: settings.per_user_sample_period_s,
    l1_delay_ms: settings.l1_delay_ms,
    l2_delay_ms: settings.l2_delay_ms,
    lockout_s: settings.lockout_s,
  };
}

export function ip_params(settings: RateLimitSettings): ContextParams {
  return {
    threshold: settings.per_ip_threshold,
    sample_period_s: settings.per_ip_sample_period_s,
    l1_delay_ms: settings.l1_delay_ms,
    l2_delay_ms: settings.l2_delay_ms,
    lockout_s: settings.lockout_s,
  };
}

/** #214 seam: delay 0, never L3, no Redis writes. */
export function stub_rate_limit(): RateLimitEvaluator {
  return {
    evaluate() {
      return { delay_ms: 0, lockout: false };
    },
    record_failure() {},
  };
}

export type RateLimitClock = {
  now_ms: () => number;
};

export type RateLimitSettingsFn = () => RateLimitSettings | Promise<RateLimitSettings>;

export type MemoryRateLimit = RateLimitEvaluator & {
  contexts: Map<string, ContextState>;
  bytes: number;
  purge_count: number;
  run_purge: () => void;
};

function map_key(kind: ContextKind, key: string): string {
  return `${kind}\t${key}`;
}

function parse_map_key(id: string): { kind: ContextKind; key: string } {
  const tab = id.indexOf("\t");
  return {
    kind: id.slice(0, tab) as ContextKind,
    key: id.slice(tab + 1),
  };
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
  void audit.emit(
    rate_limit_trip_audit_event({
      kind,
      context_key,
      ip_address: source_ip,
    }),
  ).catch(() => undefined);
}

export function make_memory_rate_limit(
  options: {
    get_settings?: RateLimitSettingsFn;
    audit?: AuditSink;
    now_ms?: () => number;
    schedule?: (task: () => void) => void;
  } = {},
): MemoryRateLimit {
  const contexts = new Map<string, ContextState>();
  let bytes = 0;
  let purge_count = 0;
  let purge_running = false;
  const now_ms = options.now_ms ?? (() => Date.now());
  const get_settings =
    options.get_settings ?? (() => default_rate_limit_settings());
  const schedule =
    options.schedule ??
    ((task: () => void) => {
      setImmediate(task);
    });

  async function settings(): Promise<RateLimitSettings> {
    return get_settings();
  }

  function load(kind: ContextKind, key: string): ContextState | null {
    return contexts.get(map_key(kind, key)) ?? null;
  }

  function save(kind: ContextKind, key: string, state: ContextState): void {
    const id = map_key(kind, key);
    const previous = contexts.get(id);
    if (previous != null) {
      bytes -= estimate_context_bytes(previous);
    }
    contexts.set(id, state);
    bytes += estimate_context_bytes(state);
  }

  function remove(kind: ContextKind, key: string): void {
    const id = map_key(kind, key);
    const previous = contexts.get(id);
    if (previous != null) {
      bytes -= estimate_context_bytes(previous);
      contexts.delete(id);
    }
  }

  function apply_purge(cfg: RateLimitSettings): void {
    const now = now_ms();
    for (const [id, state] of [...contexts.entries()]) {
      const { kind, key } = parse_map_key(id);
      const params = kind === "ip" ? ip_params(cfg) : user_params(cfg);
      const pruned: ContextState = {
        ...state,
        failures_ms: prune_failures(state.failures_ms, now, params.sample_period_s),
      };
      if (context_is_expired(pruned, now)) {
        remove(kind, key);
      } else {
        save(kind, key, pruned);
      }
    }
    purge_count += 1;
    purge_running = false;
  }

  function maybe_schedule_purge(cfg: RateLimitSettings): void {
    if (bytes <= budget_bytes(cfg.max_kib) * PURGE_TRIGGER_RATIO) {
      return;
    }
    if (purge_running) {
      return;
    }
    purge_running = true;
    schedule(() => {
      void Promise.resolve(get_settings()).then((live) => {
        apply_purge(live);
      });
    });
  }

  async function eval_one(
    kind: ContextKind,
    key: string,
    params: ContextParams,
    source_ip: string | undefined,
  ): Promise<RateLimitResult & { lockout_started: boolean }> {
    const outcome = evaluate_context(load(kind, key), now_ms(), params);
    if (outcome.next != null) {
      save(kind, key, outcome.next);
    }
    if (outcome.lockout_started) {
      emit_trip_safe(options.audit, kind, key, source_ip);
    }
    return {
      delay_ms: outcome.delay_ms,
      lockout: outcome.lockout,
      lockout_started: outcome.lockout_started,
    };
  }

  async function record_one(
    kind: ContextKind,
    key: string,
    cfg: RateLimitSettings,
  ): Promise<void> {
    const existing = load(kind, key);
    if (existing == null && bytes >= budget_bytes(cfg.max_kib)) {
      return;
    }
    save(kind, key, record_on_context(existing, now_ms()));
  }

  const evaluator: MemoryRateLimit = {
    contexts,
    get bytes() {
      return bytes;
    },
    set bytes(value: number) {
      bytes = value;
    },
    get purge_count() {
      return purge_count;
    },
    run_purge() {
      void Promise.resolve(get_settings()).then((cfg) => {
        apply_purge(cfg);
      });
    },
    async evaluate(username_key, source_ip) {
      const cfg = await settings();
      const user = await eval_one(
        "user",
        username_key,
        user_params(cfg),
        source_ip,
      );
      let ip: RateLimitResult = { delay_ms: 0, lockout: false };
      if (source_ip != null && source_ip !== "") {
        ip = await eval_one("ip", source_ip, ip_params(cfg), source_ip);
      }
      return {
        delay_ms: user.delay_ms + ip.delay_ms,
        lockout: user.lockout || ip.lockout,
      };
    },
    async record_failure(username_key, source_ip) {
      const cfg = await settings();
      await record_one("user", username_key, cfg);
      if (source_ip != null && source_ip !== "") {
        await record_one("ip", source_ip, cfg);
      }
      maybe_schedule_purge(cfg);
    },
  };
  return evaluator;
}
