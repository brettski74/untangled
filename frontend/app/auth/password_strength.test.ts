import { describe, expect, it } from "vitest";

import { parse_password_policy } from "./password_policy";
import {
  ACCEPTABLE_RATIO_FLOOR,
  build_user_inputs,
  classify_strength,
  LITERAL_USER_INPUTS,
  STRENGTH_ACCEPTABLE_MAX,
  STRENGTH_MODERATE_MAX,
  STRENGTH_WEAK_MAX,
  STRONG_RATIO_FLOOR,
  strength_meets_submit_gate,
  validate_change_password_form,
  type PasswordPolicy,
} from "./password_strength";

const POLICY: PasswordPolicy = {
  password_minimum_chars: 12,
  password_maximum_chars: 128,
  password_acceptable_crack_time_days: 1000,
  password_guess_per_second: 10000,
  password_estimate_drift_factor: 1.1,
};

describe("password strength contract pins (#173)", () => {
  it("pins unfudged API bucket thresholds", () => {
    expect(STRENGTH_WEAK_MAX).toBe(0.5);
    expect(STRENGTH_MODERATE_MAX).toBe(1.0);
    expect(STRENGTH_ACCEPTABLE_MAX).toBe(5.0);
    expect(ACCEPTABLE_RATIO_FLOOR).toBe(1.0);
    expect(STRONG_RATIO_FLOOR).toBe(5.0);
  });

  it("classifies with the unfudged table", () => {
    expect(classify_strength(0.49)).toBe("weak");
    expect(classify_strength(0.5)).toBe("moderate");
    expect(classify_strength(0.99)).toBe("moderate");
    expect(classify_strength(1.0)).toBe("acceptable");
    expect(classify_strength(4.99)).toBe("acceptable");
    expect(classify_strength(5.0)).toBe("strong");
  });

  it("builds user_inputs like the API helper", () => {
    expect(build_user_inputs("ada", "Ada Lovelace")).toEqual([
      "ada",
      "Ada",
      "Lovelace",
      ...LITERAL_USER_INPUTS,
    ]);
    expect(build_user_inputs("  bob  ", "Al Bo")).toEqual([
      "bob",
      ...LITERAL_USER_INPUTS,
    ]);
    expect(LITERAL_USER_INPUTS).toEqual(["Untangled", "itsm"]);
  });

  it("applies drift only to the submit gate", () => {
    expect(strength_meets_submit_gate(1.0, 1.1)).toBe(false);
    expect(strength_meets_submit_gate(1.1, 1.1)).toBe(true);
    expect(classify_strength(1.05)).toBe("acceptable");
    expect(strength_meets_submit_gate(1.05, 1.1)).toBe(false);
  });
});

describe("validate_change_password_form", () => {
  it("returns rich client errors without calling the API", () => {
    const empty = validate_change_password_form({
      current_password: "",
      new_password: "",
      verify_new_password: "",
      username: "ada",
      display_name: "Ada",
      policy: POLICY,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.errors).toContain("Current password is required.");
      expect(empty.errors).toContain("New password is required.");
      expect(empty.errors).toContain("Verify new password is required.");
    }

    const mismatch = validate_change_password_form({
      current_password: "old-password-here",
      new_password: "aaaaaaaaaaaa",
      verify_new_password: "bbbbbbbbbbbb",
      username: "ada",
      display_name: "Ada",
      policy: POLICY,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.errors).toContain(
        "New password and verification do not match.",
      );
    }
  });
});

describe("parse_password_policy", () => {
  it("parses decimal drift strings from system_config", () => {
    const policy = parse_password_policy({
      password_minimum_chars: 12,
      password_maximum_chars: 128,
      password_acceptable_crack_time_days: 1000,
      password_guess_per_second: 10000,
      password_estimate_drift_factor: "1.1",
    });
    expect(policy.password_estimate_drift_factor).toBe(1.1);
  });

  it("fails closed on missing policy fields", () => {
    expect(() => parse_password_policy({})).toThrow();
  });
});
