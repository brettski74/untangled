import type { JWTPayload } from "jose";

import {
  new_correlation_id,
  audit_timestamp,
  type AuditSink,
} from "./audit.js";
import { classify_expiry } from "./expiry.js";
import {
  PASSWORD_SCHEMA_MAX_CHARS,
  type LoginProcessSettings,
} from "./login_settings.js";
import { password_strength_ok } from "./password_strength.js";
import { hash_password } from "./passwords.js";
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

export async function run_change_password(
  user: LoadedUser,
  input: ChangePasswordInput,
  settings: LoginProcessSettings,
  users: UserRepository,
  verify_password: (hash: string, password: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<ChangePasswordOutcome> {
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

  const password_expires_at = new Date(
    now.getTime() + settings.password_expiry_days * 86_400_000,
  );
  const new_hash = await hash_password(new_pw);
  await users.apply_password_change({
    id: user.id,
    password_hash: new_hash,
    password_expires_at,
    actor_id: user.id,
  });
  return { kind: "ok", user, password_expires_at };
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
