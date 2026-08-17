import type { LoadedUser } from "./users.js";

export type ExpiryVerdict = "normal_success" | "must_change" | "failure";

export type ExpiryEvaluator = {
  classify: (
    user: LoadedUser,
    args: { grace_days: number; now: Date },
  ) => ExpiryVerdict;
};

const MS_PER_DAY = 86_400_000;

export function classify_expiry(
  user: LoadedUser,
  args: { grace_days: number; now: Date },
): ExpiryVerdict {
  const now_ms = args.now.getTime();
  const expires_ms = user.password_expires_at.getTime();
  const grace_end_ms = expires_ms + args.grace_days * MS_PER_DAY;
  if (now_ms < expires_ms) {
    return "normal_success";
  }
  if (now_ms <= grace_end_ms) {
    return "must_change";
  }
  return "failure";
}

export function password_expiry_evaluator(): ExpiryEvaluator {
  return { classify: classify_expiry };
}
