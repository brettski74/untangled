import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool } from "pg";

import { make_user_repository } from "../src/users.js";
import { TEST_ADMIN, TEST_PASSWORD_HASH } from "./helpers.js";

type QueryCall = { sql: string; params: unknown[] };

function capturing_pool(calls: QueryCall[]): Pool {
  return {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as Pool;
}

describe("make_user_repository timestamp binds", () => {
  it("rounds password_expires_at and updated_at to whole seconds", async () => {
    const calls: QueryCall[] = [];
    const users = make_user_repository(capturing_pool(calls));
    await users.apply_password_change({
      id: TEST_ADMIN.id,
      password_hash: TEST_PASSWORD_HASH,
      password_expires_at: new Date("2026-11-14T12:00:00.600Z"),
      actor_id: TEST_ADMIN.id,
    });
    assert.equal(calls.length, 1);
    const expires = calls[0]?.params[1];
    const updated_at = calls[0]?.params[2];
    assert.ok(expires instanceof Date);
    assert.ok(updated_at instanceof Date);
    assert.equal(expires.toISOString(), "2026-11-14T12:00:01.000Z");
    assert.equal(expires.getUTCMilliseconds(), 0);
    assert.equal(updated_at.getUTCMilliseconds(), 0);
  });

  it("rounds updated_at on failed-login updates", async () => {
    const calls: QueryCall[] = [];
    const users = make_user_repository(capturing_pool(calls));
    await users.set_failed_login_count(TEST_ADMIN.id, 1);
    assert.equal(calls.length, 1);
    const updated_at = calls[0]?.params[1];
    assert.ok(updated_at instanceof Date);
    assert.equal(updated_at.getUTCMilliseconds(), 0);
  });
});
