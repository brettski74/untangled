import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run_change_password } from "../src/change_password.js";
import {
  TEST_ADMIN,
  TEST_PASSWORD_HASH,
  memory_users,
  test_login_settings,
} from "./helpers.js";

const STRONG_NEW = "orchid-lantern-quasar-7N!pQ2xm";

describe("run_change_password", () => {
  it("accepts a strong new password when current verify is injected", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const outcome = await run_change_password(
      TEST_ADMIN,
      {
        current_password: "admin-change-me",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      },
      test_login_settings(),
      users,
      async (password_hash, password) =>
        password_hash === TEST_PASSWORD_HASH && password === "admin-change-me",
    );
    assert.equal(outcome.kind, "ok");
    const updated = await users.load_by_id(TEST_ADMIN.id);
    assert.ok(updated != null);
    assert.notEqual(updated.password_hash, TEST_PASSWORD_HASH);
    assert.equal(updated.failed_login_count, 0);
  });

  it("stores password_expires_at at whole-second UTC", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const now = new Date("2026-08-16T12:00:00.600Z");
    const outcome = await run_change_password(
      TEST_ADMIN,
      {
        current_password: "admin-change-me",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      },
      test_login_settings(),
      users,
      async (password_hash, password) =>
        password_hash === TEST_PASSWORD_HASH && password === "admin-change-me",
      now,
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") {
      return;
    }
    assert.equal(
      outcome.password_expires_at.toISOString(),
      "2026-11-14T12:00:01.000Z",
    );
    const updated = await users.load_by_id(TEST_ADMIN.id);
    assert.equal(
      updated?.password_expires_at.toISOString(),
      "2026-11-14T12:00:01.000Z",
    );
    assert.equal(updated?.password_expires_at.getUTCMilliseconds(), 0);
  });

  it("fails closed on a wrong current password without applying a hash", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const outcome = await run_change_password(
      TEST_ADMIN,
      {
        current_password: "wrong-password",
        new_password: STRONG_NEW,
        verify_new_password: STRONG_NEW,
      },
      test_login_settings(),
      users,
      async (password_hash, password) =>
        password_hash === TEST_PASSWORD_HASH && password === "admin-change-me",
    );
    assert.equal(outcome.kind, "failed");
    const updated = await users.load_by_id(TEST_ADMIN.id);
    assert.equal(updated?.password_hash, TEST_PASSWORD_HASH);
  });
});
