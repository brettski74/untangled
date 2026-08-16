import { login_audit_event, type AuditSink } from "./audit.js";
import type { ExpiryEvaluator } from "./expiry.js";
import type { HashSlotLimiter } from "./hash_slots.js";
import {
  INVALID_OR_OVERSIZE,
  PASSWORD_SCHEMA_MAX_CHARS,
  USERNAME_EVENT_BOUND,
  type LoginProcessSettings,
} from "./login_settings.js";
import { remaining_wait_ms } from "./padding.js";
import type { RateLimitEvaluator } from "./rate_limit.js";
import { fold_username, username_is_valid } from "./username.js";
import type { LoadedUser, UserRepository } from "./users.js";

export type LoginRequestContext = {
  provided_username: string;
  password: string;
  source_ip: string | undefined;
  protocol: string | undefined;
  host: string | undefined;
  context_path: string;
  user_agent: string | undefined;
};

export type LoginPipelineResult =
  | { kind: "success"; user_id: string }
  | { kind: "denied" }
  | { kind: "capacity" }
  | { kind: "internal_error" };

export type LoginPipelineDeps = {
  settings: LoginProcessSettings;
  hash_slots: HashSlotLimiter;
  rate_limit: RateLimitEvaluator;
  expiry: ExpiryEvaluator;
  users: UserRepository;
  verify_password: (hash: string, password: string) => Promise<boolean>;
  dummy_hash: string;
  audit: AuditSink;
  draw_t: (min: number, max: number) => number;
  now_ms: () => number;
  sleep: (ms: number) => Promise<void>;
};

function bound_username(raw: string): string {
  if (raw.length <= USERNAME_EVENT_BOUND) {
    return raw;
  }
  return raw.slice(0, USERNAME_EVENT_BOUND);
}

function event_data(
  ctx: LoginRequestContext,
  username_key: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    username_provided: bound_username(ctx.provided_username),
    username_key,
    protocol: ctx.protocol ?? null,
    host: ctx.host ?? null,
    context_path: ctx.context_path,
    user_agent: ctx.user_agent ?? null,
    ...extra,
  };
}

export async function run_login_pipeline(
  ctx: LoginRequestContext,
  deps: LoginPipelineDeps,
): Promise<LoginPipelineResult> {
  let t_ms: number;
  try {
    t_ms = deps.draw_t(
      deps.settings.process_time_minimum_ms,
      deps.settings.process_time_maximum_ms,
    );
  } catch {
    return { kind: "internal_error" };
  }
  const started_ms = deps.now_ms();

  const folded = fold_username(ctx.provided_username);
  const username_valid = username_is_valid(folded);
  const username_key = username_valid ? folded : INVALID_OR_OVERSIZE;
  let auth_failed = !username_valid;
  let skip_to_landing = !username_valid;
  let failure_reason = username_valid ? "" : "invalid_username";
  let account_independent = !username_valid;
  let user: LoadedUser | null = null;
  let verify_ok = false;
  let acquired = false;

  try {
    const rl = await deps.rate_limit.evaluate(username_key, ctx.source_ip);
    const rl_delay_ms = rl.delay_ms;
    if (rl.lockout) {
      auth_failed = true;
      skip_to_landing = true;
      account_independent = true;
      if (failure_reason === "") {
        failure_reason = "rate_limit_lockout";
      }
    }
    if (!skip_to_landing && username_valid) {
      const password = ctx.password;
      if (
        password === "" ||
        password.length > PASSWORD_SCHEMA_MAX_CHARS
      ) {
        auth_failed = true;
        skip_to_landing = true;
        account_independent = true;
        failure_reason = "password_empty_or_oversize";
      }
    }

    if (!skip_to_landing) {
      if (!deps.hash_slots.try_acquire()) {
        await emit_safe(deps.audit, {
          success: false,
          reason: "hash_capacity",
          user_id: null,
          ip_address: ctx.source_ip,
          capacity: true,
          data: event_data(ctx, username_key, {}),
        });
        return { kind: "capacity" };
      }
      acquired = true;
      user = await deps.users.load_by_username(folded);
      const hash = user?.password_hash ?? deps.dummy_hash;
      verify_ok = await deps.verify_password(hash, ctx.password);
    }

    let success = false;
    let user_id: string | null = user?.id ?? null;

    if (!skip_to_landing && user != null && verify_ok) {
      if (!user.is_active) {
        auth_failed = true;
        failure_reason = "inactive";
      } else if (user.failed_login_count >= deps.settings.maximum_failed_count) {
        auth_failed = true;
        failure_reason = "failed_count_lockout";
      } else {
        const expiry = deps.expiry.classify(user);
        if (expiry === "failure") {
          auth_failed = true;
          failure_reason = "password_age_locked";
        } else {
          success = true;
          auth_failed = false;
        }
      }
    } else if (!skip_to_landing) {
      auth_failed = true;
      if (user == null) {
        failure_reason = "unknown_user";
      } else {
        failure_reason = "bad_password";
      }
    }

    if (success && user != null) {
      await deps.users.set_failed_login_count(user.id, 0);
      user = { ...user, failed_login_count: 0 };
    } else if (auth_failed && !account_independent && user != null) {
      const next = user.failed_login_count + 1;
      await deps.users.set_failed_login_count(user.id, next);
      user = { ...user, failed_login_count: next };
    }

    if (acquired) {
      deps.hash_slots.release();
      acquired = false;
    }

    const extra: Record<string, unknown> = {};
    if (username_valid) {
      extra.username_exists = user != null;
    } else {
      extra.username_exists = false;
    }
    if (user != null) {
      extra.is_active = user.is_active;
      extra.failed_login_count = user.failed_login_count;
    }

    await emit_safe(deps.audit, {
      success,
      reason: success ? "login_ok" : failure_reason,
      user_id,
      ip_address: ctx.source_ip,
      data: event_data(ctx, username_key, extra),
    });

    if (auth_failed) {
      await deps.rate_limit.record_failure(username_key, ctx.source_ip);
      const elapsed_ms = deps.now_ms() - started_ms;
      await deps.sleep(remaining_wait_ms(t_ms, rl_delay_ms, elapsed_ms));
      return { kind: "denied" };
    }
    if (user == null) {
      return { kind: "internal_error" };
    }
    return { kind: "success", user_id: user.id };
  } catch {
    if (acquired) {
      deps.hash_slots.release();
    }
    return { kind: "internal_error" };
  }
}

async function emit_safe(
  audit: AuditSink,
  args: Parameters<typeof login_audit_event>[0],
): Promise<void> {
  await audit.emit(login_audit_event(args));
}
