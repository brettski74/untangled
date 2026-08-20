import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool } from "pg";

import {
  DELETE_EXPIRED_USER_SESSION_SQL,
  DELETE_USED_REFRESH_TOKEN_SQL,
  run_session_cleanup,
} from "../src/session_cleanup.js";

describe("session cleanup SQL", () => {
  it("deletes used tokens by expires_at and sessions by either expiry", async () => {
    assert.match(DELETE_USED_REFRESH_TOKEN_SQL, /expires_at <= \$1/);
    assert.doesNotMatch(DELETE_USED_REFRESH_TOKEN_SQL, /session_refresh_ttl/);
    assert.match(
      DELETE_EXPIRED_USER_SESSION_SQL,
      /session_expires_at <= \$1 OR refresh_expires_at <= \$1/,
    );

    const statements: { sql: string; params: unknown[] }[] = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        statements.push({ sql, params });
        return { rowCount: 3 };
      },
    } as unknown as Pool;
    const now = new Date("2026-08-20T16:00:00.000Z");
    const result = await run_session_cleanup(pool, now);
    assert.deepEqual(result, { used_tokens: 3, sessions: 3 });
    assert.equal(statements.length, 2);
    assert.equal(statements[0]?.sql, DELETE_USED_REFRESH_TOKEN_SQL);
    assert.equal(statements[1]?.sql, DELETE_EXPIRED_USER_SESSION_SQL);
    assert.deepEqual(statements[0]?.params, [now]);
    assert.deepEqual(statements[1]?.params, [now]);
  });
});
