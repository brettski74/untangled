import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classify_expiry } from "../src/expiry.js";
import { TEST_ADMIN } from "./helpers.js";

describe("classify_expiry", () => {
  const now = new Date("2026-08-16T12:00:00Z");

  it("is normal_success before password_expires_at", () => {
    assert.equal(
      classify_expiry(
        {
          ...TEST_ADMIN,
          password_expires_at: new Date("2026-08-17T12:00:00Z"),
        },
        { grace_days: 14, now },
      ),
      "normal_success",
    );
  });

  it("is must_change from expiry through grace end", () => {
    assert.equal(
      classify_expiry(
        {
          ...TEST_ADMIN,
          password_expires_at: new Date("2026-08-16T12:00:00Z"),
        },
        { grace_days: 14, now },
      ),
      "must_change",
    );
    assert.equal(
      classify_expiry(
        {
          ...TEST_ADMIN,
          password_expires_at: new Date("2026-08-02T12:00:00Z"),
        },
        { grace_days: 14, now },
      ),
      "must_change",
    );
  });

  it("is failure after grace", () => {
    assert.equal(
      classify_expiry(
        {
          ...TEST_ADMIN,
          password_expires_at: new Date("2026-08-02T11:59:59Z"),
        },
        { grace_days: 14, now },
      ),
      "failure",
    );
  });
});
