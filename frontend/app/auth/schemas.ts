/**
 * Hand-authored Zod envelopes for auth HTTP responses.
 *
 * Known gap: frontend generated Zod from class YAML is not wired for consumption
 * yet. These schemas stay limited to fields this gate actually consumes — not a
 * parallel persistence model of the user record.
 */
import { z } from "zod";

export const token_pair_schema = z.object({
  access_token: z.string().min(1),
  // Optional: this ticket discards refresh; do not fail closed if absent.
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().default("bearer"),
});

export type TokenPair = z.infer<typeof token_pair_schema>;

/** Only fields rendered or used by the login-gate stub. */
export const user_profile_schema = z.object({
  username: z.string(),
  display_name: z.string(),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});

export type UserProfile = z.infer<typeof user_profile_schema>;

/** Generic success/failure envelope for POST /auth/change-password. */
export const change_password_response_schema = z.object({
  detail: z.string(),
});

export type ChangePasswordResponse = z.infer<
  typeof change_password_response_schema
>;
