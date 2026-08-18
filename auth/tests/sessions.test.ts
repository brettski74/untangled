import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SELECT_SESSION_FOR_UPDATE_SQL,
  memory_sessions,
} from "../src/sessions.js";
import { hmac_refresh_token, mint_refresh_token } from "../src/refresh_hmac.js";

const USER_ID = "01900000-0000-7000-8000-000000000001";
const SESSION_ID = "01900000-0000-7000-8000-0000000000aa";
const SECRET = Buffer.alloc(32, 7);

function hmac(token: string): string {
  return hmac_refresh_token(SECRET, token);
}

describe("session rotate repository", () => {
  it("includes FOR UPDATE on the postgres lock query", () => {
    assert.match(SELECT_SESSION_FOR_UPDATE_SQL, /FOR UPDATE/);
    assert.match(SELECT_SESSION_FOR_UPDATE_SQL, /refresh_hmac = \$1/);
  });

  it("rotates HMAC, records used token, and never moves session_expires_at", async () => {
    const sessions = memory_sessions();
    const old_token = mint_refresh_token();
    const new_token = mint_refresh_token();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const session_expires_at = new Date("2026-01-31T00:00:00.000Z");
    await sessions.create({
      id: SESSION_ID,
      user_id: USER_ID,
      refresh_hmac: hmac(old_token),
      session_expires_at,
      refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
      ip_address: "203.0.113.1",
      user_agent: "old-ua",
    });
    const result = await sessions.attempt_rotate({
      old_hmac: hmac(old_token),
      new_hmac: hmac(new_token),
      user_id: USER_ID,
      session_id: SESSION_ID,
      now,
      refresh_ttl_seconds: 3600,
      reuse_grace_seconds: 15,
      reuse_window_seconds: 86400,
      ip_address: "203.0.113.9",
      user_agent: "new-ua",
    });
    assert.equal(result.kind, "rotated");
    if (result.kind !== "rotated") {
      return;
    }
    assert.equal(result.session_expires_at.getTime(), session_expires_at.getTime());
    assert.equal(sessions.rows[0]?.refresh_hmac, hmac(new_token));
    assert.equal(sessions.rows[0]?.ip_address, "203.0.113.9");
    assert.equal(sessions.rows[0]?.user_agent, "new-ua");
    assert.equal(sessions.used.length, 1);
    assert.equal(sessions.used[0]?.refresh_hmac, hmac(old_token));
  });

  it("soft-reuses a consumed token within grace and keeps the session", async () => {
    const sessions = memory_sessions();
    const first = mint_refresh_token();
    const second = mint_refresh_token();
    const now = new Date("2026-01-01T00:00:00.000Z");
    await sessions.create({
      id: SESSION_ID,
      user_id: USER_ID,
      refresh_hmac: hmac(first),
      session_expires_at: new Date("2026-01-31T00:00:00.000Z"),
      refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
      ip_address: null,
      user_agent: null,
    });
    await sessions.attempt_rotate({
      old_hmac: hmac(first),
      new_hmac: hmac(second),
      user_id: USER_ID,
      session_id: SESSION_ID,
      now,
      refresh_ttl_seconds: 3600,
      reuse_grace_seconds: 15,
      reuse_window_seconds: 86400,
      ip_address: null,
      user_agent: null,
    });
    const replay = await sessions.attempt_rotate({
      old_hmac: hmac(first),
      new_hmac: hmac(mint_refresh_token()),
      user_id: USER_ID,
      session_id: SESSION_ID,
      now: new Date(now.getTime() + 5_000),
      refresh_ttl_seconds: 3600,
      reuse_grace_seconds: 15,
      reuse_window_seconds: 86400,
      ip_address: null,
      user_agent: null,
    });
    assert.equal(replay.kind, "soft_reuse");
    assert.equal(sessions.rows.length, 1);
    assert.equal(sessions.rows[0]?.refresh_hmac, hmac(second));
    assert.equal(sessions.used.length, 1);
  });

  it("hard-reuses after grace and tears down session plus used tokens", async () => {
    const sessions = memory_sessions();
    const first = mint_refresh_token();
    const second = mint_refresh_token();
    const now = new Date("2026-01-01T00:00:00.000Z");
    await sessions.create({
      id: SESSION_ID,
      user_id: USER_ID,
      refresh_hmac: hmac(first),
      session_expires_at: new Date("2026-01-31T00:00:00.000Z"),
      refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
      ip_address: null,
      user_agent: null,
    });
    await sessions.attempt_rotate({
      old_hmac: hmac(first),
      new_hmac: hmac(second),
      user_id: USER_ID,
      session_id: SESSION_ID,
      now,
      refresh_ttl_seconds: 3600,
      reuse_grace_seconds: 15,
      reuse_window_seconds: 86400,
      ip_address: null,
      user_agent: null,
    });
    const replay = await sessions.attempt_rotate({
      old_hmac: hmac(first),
      new_hmac: hmac(mint_refresh_token()),
      user_id: USER_ID,
      session_id: SESSION_ID,
      now: new Date(now.getTime() + 16_000),
      refresh_ttl_seconds: 3600,
      reuse_grace_seconds: 15,
      reuse_window_seconds: 86400,
      ip_address: null,
      user_agent: null,
    });
    assert.equal(replay.kind, "hard_reuse");
    assert.equal(sessions.rows.length, 0);
    assert.equal(sessions.used.length, 0);
  });
});
