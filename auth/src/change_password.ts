import type { JWTPayload } from "jose";

import {
  new_correlation_id,
  audit_timestamp,
  type AuditSink,
} from "./audit.js";
import type { ChangePasswordApply } from "./change_password_apply.js";
import { utc_seconds } from "./datetime_utc.js";
import { classify_expiry } from "./expiry.js";
import {
  PASSWORD_SCHEMA_MAX_CHARS,
  type LoginProcessSettings,
} from "./login_settings.js";
import { password_strength_ok } from "./password_strength.js";
import { hash_password } from "./passwords.js";
import { hmac_refresh_token, mint_refresh_token } from "./refresh_hmac.js";
import { rotate_session_times } from "./session_issue.js";
import type { LoadedUser, UserRepository } from "./users.js";

export const PASSWORD_CHANGE_OK = "Password change complete.";
export const PASSWORD_CHANGE_FAILED = "Password change failed.";

export type ChangePasswordInput = {
  current_password: string;
  new_password: string;
  verify_new_password: string;
};

export type ChangePasswordOutcome =
  | { kind: "ok"; user: LoadedUser; password_expires_at: Date }
  | { kind: "failed" }
  | { kind: "locked" };

export type ChangePasswordEffect =
  | { kind: "tokens_unchanged" }
  | { kind: "first_refresh"; refresh_token: string; refresh_max_age: number }
  | { kind: "logged_out" };

export type ChangePasswordExecuteResult =
  | { kind: "missing_user" }
  | { kind: "failed"; username: string }
  | { kind: "locked"; username: string }
  | { kind: "ok"; effect: ChangePasswordEffect; username: string };

export async function evaluate_change_password(
  user: LoadedUser,
  input: ChangePasswordInput,
  settings: LoginProcessSettings,
  verify_password: (hash: string, password: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<{ kind: "ok" } | { kind: "failed" } | { kind: "locked" }> {
  const expiry = classify_expiry(user, {
    grace_days: settings.password_grace_days,
    now,
  });
  if (
    expiry === "failure" ||
    user.failed_login_count >= settings.maximum_failed_count
  ) {
    return { kind: "locked" };
  }

  let valid = true;
  const current = input.current_password;
  if (current === "" || current.length > PASSWORD_SCHEMA_MAX_CHARS) {
    valid = false;
  }
  if (!user.is_active) {
    valid = false;
  }
  const current_ok = await verify_password(
    user.password_hash,
    current === "" ? "\0untangled-change-password-dummy" : current,
  );
  if (!current_ok) {
    valid = false;
  }

  const new_pw = input.new_password;
  const verify_pw = input.verify_new_password;
  if (new_pw !== verify_pw) {
    valid = false;
  }
  if (new_pw === current) {
    valid = false;
  }
  if (
    new_pw.length < settings.password_minimum_chars ||
    new_pw.length > settings.password_maximum_chars
  ) {
    valid = false;
  }
  if (
    !password_strength_ok(new_pw, {
      username: user.username,
      display_name: user.display_name,
      guess_per_second: settings.password_guess_per_second,
      acceptable_crack_time_days: settings.password_acceptable_crack_time_days,
    })
  ) {
    valid = false;
  }

  if (!valid) {
    return { kind: "failed" };
  }
  return { kind: "ok" };
}

export async function run_change_password(
  user: LoadedUser,
  input: ChangePasswordInput,
  settings: LoginProcessSettings,
  users: UserRepository,
  verify_password: (hash: string, password: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<ChangePasswordOutcome> {
  const evaluated = await evaluate_change_password(
    user,
    input,
    settings,
    verify_password,
    now,
  );
  if (evaluated.kind !== "ok") {
    return evaluated;
  }

  const password_expires_at = utc_seconds(
    new Date(now.getTime() + settings.password_expiry_days * 86_400_000),
  );
  const new_hash = await hash_password(input.new_password);
  await users.apply_password_change({
    id: user.id,
    password_hash: new_hash,
    password_expires_at,
    actor_id: user.id,
  });
  return { kind: "ok", user, password_expires_at };
}

export async function execute_change_password(
  apply: ChangePasswordApply,
  args: {
    user_id: string;
    session_id: string | undefined;
    input: ChangePasswordInput;
    invalidate_user_sessions: boolean;
    settings: LoginProcessSettings & { session_refresh_ttl_seconds: number };
    verify_password: (hash: string, password: string) => Promise<boolean>;
    refresh_hmac_secret: Buffer;
    ip_address: string | null;
    user_agent: string | null;
    now?: Date;
  },
): Promise<ChangePasswordExecuteResult> {
  const now = args.now ?? new Date();
  const ran = await apply.run_locked(args.user_id, async (tx) => {
    const username = tx.user.username;
    const evaluated = await evaluate_change_password(
      tx.user,
      args.input,
      args.settings,
      args.verify_password,
      now,
    );
    if (evaluated.kind !== "ok") {
      return { ...evaluated, username };
    }
    const password_expires_at = utc_seconds(
      new Date(now.getTime() + args.settings.password_expiry_days * 86_400_000),
    );
    const new_hash = await hash_password(args.input.new_password);
    await tx.apply_password_change({
      password_hash: new_hash,
      password_expires_at,
      actor_id: tx.user.id,
    });
    if (args.invalidate_user_sessions) {
      await tx.invalidate_all_sessions();
      return {
        kind: "ok" as const,
        effect: { kind: "logged_out" as const },
        username,
      };
    }
    const session_id = args.session_id;
    if (session_id == null || session_id === "") {
      return {
        kind: "ok" as const,
        effect: { kind: "tokens_unchanged" as const },
        username,
      };
    }
    const session = await tx.get_session(session_id);
    if (session == null || session.refresh_hmac != null) {
      return {
        kind: "ok" as const,
        effect: { kind: "tokens_unchanged" as const },
        username,
      };
    }
    const times = rotate_session_times({
      now,
      session_expires_at: session.session_expires_at,
      refresh_ttl_seconds: args.settings.session_refresh_ttl_seconds,
    });
    const refresh_token = mint_refresh_token();
    const issued = await tx.issue_first_refresh({
      session_id,
      refresh_hmac: hmac_refresh_token(args.refresh_hmac_secret, refresh_token),
      refresh_expires_at: times.refresh_expires_at,
      ip_address: args.ip_address,
      user_agent: args.user_agent,
    });
    if (!issued) {
      return {
        kind: "ok" as const,
        effect: { kind: "tokens_unchanged" as const },
        username,
      };
    }
    return {
      kind: "ok" as const,
      effect: {
        kind: "first_refresh" as const,
        refresh_token,
        refresh_max_age: times.max_age,
      },
      username,
    };
  });
  if (ran == null) {
    return { kind: "missing_user" };
  }
  return ran;
}

export function password_change_audit(
  audit: AuditSink,
  args: {
    success: boolean;
    user_id: string | null;
    ip_address: string | undefined;
    reason: string;
    data: Record<string, unknown>;
  },
): Promise<void> {
  return audit.emit({
    event_type: "auth.password_change",
    actor_channel: "human",
    outcome: args.success ? "success" : "failure",
    reason: args.reason,
    severity: args.success ? "info" : "warning",
    correlation_id: new_correlation_id(),
    user_id: args.user_id,
    ip_address: args.ip_address ?? null,
    timestamp: audit_timestamp(),
    data: args.data,
  });
}

export function remaining_access_exp(payload: JWTPayload): number | undefined {
  return typeof payload.exp === "number" ? payload.exp : undefined;
}
