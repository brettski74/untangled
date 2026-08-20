import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { execute_change_password, run_change_password } from "../src/change_password.js";
import { memory_change_password_apply } from "../src/change_password_apply.js";
import { memory_sessions } from "../src/sessions.js";
import {
  TEST_ADMIN,
  TEST_PASSWORD_HASH,
  TEST_USER_ID,
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

describe("execute_change_password", () => {
  const verify = async (password_hash: string, password: string) =>
    password_hash === TEST_PASSWORD_HASH && password === "admin-change-me";

  it("leaves tokens unchanged on an already-refreshable session", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const sessions = memory_sessions();
    const sid = "01900000-0000-7000-8000-0000000000aa";
    await sessions.create({
      id: sid,
      user_id: TEST_USER_ID,
      refresh_hmac: "already-issued",
      session_expires_at: new Date("2026-02-01T00:00:00.000Z"),
      refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
      ip_address: "203.0.113.1",
      user_agent: "old-ua",
    });
    const outcome = await execute_change_password(
      memory_change_password_apply(users, sessions),
      {
        user_id: TEST_USER_ID,
        session_id: sid,
        input: {
          current_password: "admin-change-me",
          new_password: STRONG_NEW,
          verify_new_password: STRONG_NEW,
        },
        invalidate_user_sessions: false,
        settings: test_login_settings(),
        verify_password: verify,
        refresh_hmac_secret: Buffer.alloc(32, 9),
        ip_address: "203.0.113.9",
        user_agent: "new-ua",
      },
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") {
      return;
    }
    assert.equal(outcome.effect.kind, "tokens_unchanged");
    assert.equal(sessions.rows[0]?.refresh_hmac, "already-issued");
    assert.equal(sessions.rows[0]?.user_agent, "old-ua");
    const updated = await users.load_by_id(TEST_USER_ID);
    assert.notEqual(updated?.password_hash, TEST_PASSWORD_HASH);
  });

  it("does not 500 when the session row is missing", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const sessions = memory_sessions();
    const outcome = await execute_change_password(
      memory_change_password_apply(users, sessions),
      {
        user_id: TEST_USER_ID,
        session_id: "01900000-0000-7000-8000-0000000000aa",
        input: {
          current_password: "admin-change-me",
          new_password: STRONG_NEW,
          verify_new_password: STRONG_NEW,
        },
        invalidate_user_sessions: false,
        settings: test_login_settings(),
        verify_password: verify,
        refresh_hmac_secret: Buffer.alloc(32, 9),
        ip_address: null,
        user_agent: null,
      },
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") {
      return;
    }
    assert.equal(outcome.effect.kind, "tokens_unchanged");
    const updated = await users.load_by_id(TEST_USER_ID);
    assert.notEqual(updated?.password_hash, TEST_PASSWORD_HASH);
  });

  it("does not apply session deletes when validation fails", async () => {
    const users = memory_users([{ ...TEST_ADMIN }]);
    const sessions = memory_sessions();
    await sessions.create({
      id: "01900000-0000-7000-8000-0000000000aa",
      user_id: TEST_USER_ID,
      refresh_hmac: "keep-me",
      session_expires_at: new Date("2026-02-01T00:00:00.000Z"),
      refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
      ip_address: null,
      user_agent: null,
    });
    const outcome = await execute_change_password(
      memory_change_password_apply(users, sessions),
      {
        user_id: TEST_USER_ID,
        session_id: "01900000-0000-7000-8000-0000000000aa",
        input: {
          current_password: "wrong-password",
          new_password: STRONG_NEW,
          verify_new_password: STRONG_NEW,
        },
        invalidate_user_sessions: true,
        settings: test_login_settings(),
        verify_password: verify,
        refresh_hmac_secret: Buffer.alloc(32, 9),
        ip_address: null,
        user_agent: null,
      },
    );
    assert.equal(outcome.kind, "failed");
    assert.equal(sessions.rows.length, 1);
    assert.equal(sessions.rows[0]?.refresh_hmac, "keep-me");
  });
});
