import type { LoadedUser } from "./users.js";

export type ExpiryVerdict = "normal_success" | "must_change" | "failure";

export type ExpiryEvaluator = {
  classify: (user: LoadedUser) => ExpiryVerdict;
};

/** #215 seam: not expired. */
export function stub_expiry(): ExpiryEvaluator {
  return {
    classify() {
      return "normal_success";
    },
  };
}
