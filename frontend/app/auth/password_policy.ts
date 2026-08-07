/**
 * Parse password policy fields from the public system-config singleton record.
 * Fail-closed: throws when required fields are missing or invalid.
 */
import { z } from "zod";

import type { PasswordPolicy } from "./password_strength";

const password_policy_schema = z.object({
  password_minimum_chars: z.number().int(),
  password_maximum_chars: z.number().int(),
  password_acceptable_crack_time_days: z.number().int(),
  password_guess_per_second: z.number().int(),
  password_estimate_drift_factor: z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "invalid password_estimate_drift_factor",
        });
        return z.NEVER;
      }
      return n;
    }),
});

export function parse_password_policy(
  record: Record<string, unknown>,
): PasswordPolicy {
  return password_policy_schema.parse(record);
}
