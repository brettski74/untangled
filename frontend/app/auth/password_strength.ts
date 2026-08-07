/**
 * Frontend password strength helpers for change-password UI.
 *
 * Display buckets match the API unfudged table. Submit-enablement applies
 * password_estimate_drift_factor to the acceptable lower bound only.
 */
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";

/** Unfudged API bucket thresholds (crack-time ratio). Keep in lockstep with backend. */
export const STRENGTH_WEAK_MAX = 0.5;
export const STRENGTH_MODERATE_MAX = 1.0;
export const STRENGTH_ACCEPTABLE_MAX = 5.0;
export const ACCEPTABLE_RATIO_FLOOR = 1.0;
export const STRONG_RATIO_FLOOR = 5.0;

/** Match Python zxcvbn scoring prefix guard (not product max-chars). */
export const ZXCVBN_MAX_PASSWORD_LENGTH = 72;

export const LITERAL_USER_INPUTS = ["Untangled", "itsm"] as const;

const SECONDS_PER_DAY = 86400;

export type StrengthClass = "weak" | "moderate" | "acceptable" | "strong";

export type PasswordPolicy = {
  password_minimum_chars: number;
  password_maximum_chars: number;
  password_acceptable_crack_time_days: number;
  password_guess_per_second: number;
  password_estimate_drift_factor: number;
};

const zxcvbn = new ZxcvbnFactory({
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: { ...zxcvbnCommon.dictionary },
});

export function build_user_inputs(
  username: string,
  display_name: string,
): string[] {
  const inputs: string[] = [];
  const user = username.trim();
  if (user) {
    inputs.push(user);
  }
  for (const segment of display_name.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 3) {
      inputs.push(segment);
    }
  }
  inputs.push(...LITERAL_USER_INPUTS);
  return inputs;
}

export function classify_strength(ratio: number): StrengthClass {
  if (ratio < STRENGTH_WEAK_MAX) {
    return "weak";
  }
  if (ratio < STRENGTH_MODERATE_MAX) {
    return "moderate";
  }
  if (ratio < STRENGTH_ACCEPTABLE_MAX) {
    return "acceptable";
  }
  return "strong";
}

export function crack_time_ratio(
  password: string,
  args: {
    user_inputs: string[];
    guess_per_second: number;
    acceptable_crack_time_days: number;
  },
): number {
  if (password === "") {
    return 0;
  }
  const scored = password.slice(0, ZXCVBN_MAX_PASSWORD_LENGTH);
  const result = zxcvbn.check(scored, args.user_inputs);
  const guesses_per_second = Math.max(Math.trunc(args.guess_per_second), 1);
  const acceptable_days = Math.max(
    Math.trunc(args.acceptable_crack_time_days),
    1,
  );
  const crack_time_days =
    result.guesses / guesses_per_second / SECONDS_PER_DAY;
  return crack_time_days / acceptable_days;
}

/** True when ratio clears the drifted acceptable floor (submit gate). */
export function strength_meets_submit_gate(
  ratio: number,
  drift_factor: number,
): boolean {
  const drift =
    Number.isFinite(drift_factor) && drift_factor >= 1 ? drift_factor : 1;
  return ratio >= ACCEPTABLE_RATIO_FLOOR * drift;
}

export function evaluate_new_password_strength(
  password: string,
  args: {
    username: string;
    display_name: string;
    policy: PasswordPolicy;
  },
): { ratio: number; classification: StrengthClass; submit_ok: boolean } {
  const ratio = crack_time_ratio(password, {
    user_inputs: build_user_inputs(args.username, args.display_name),
    guess_per_second: args.policy.password_guess_per_second,
    acceptable_crack_time_days: args.policy.password_acceptable_crack_time_days,
  });
  return {
    ratio,
    classification: classify_strength(ratio),
    submit_ok: strength_meets_submit_gate(
      ratio,
      args.policy.password_estimate_drift_factor,
    ),
  };
}

export type ClientValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Informative client-side checks before calling the change-password API.
 */
export function validate_change_password_form(args: {
  current_password: string;
  new_password: string;
  verify_new_password: string;
  username: string;
  display_name: string;
  policy: PasswordPolicy;
}): ClientValidationResult {
  const errors: string[] = [];

  if (!args.current_password) {
    errors.push("Current password is required.");
  }
  if (!args.new_password) {
    errors.push("New password is required.");
  }
  if (!args.verify_new_password) {
    errors.push("Verify new password is required.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (args.new_password !== args.verify_new_password) {
    errors.push("New password and verification do not match.");
  }
  if (args.new_password === args.current_password) {
    errors.push("New password must be different from the current password.");
  }
  if (
    args.new_password.length < args.policy.password_minimum_chars ||
    args.new_password.length > args.policy.password_maximum_chars
  ) {
    errors.push(
      `New password must be between ${args.policy.password_minimum_chars} and ${args.policy.password_maximum_chars} characters.`,
    );
  }

  const strength = evaluate_new_password_strength(args.new_password, {
    username: args.username,
    display_name: args.display_name,
    policy: args.policy,
  });
  if (!strength.submit_ok) {
    errors.push(
      `New password strength is ${strength.classification}; it must be acceptable or strong.`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
