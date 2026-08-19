import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateKeyPair } from "jose";

import { memory_audit_sink, AUTH_LOGOUT, type AuditEvent } from "../src/audit.js";
import { sign_access_token } from "../src/jwt.js";
import { run_logout_pipeline } from "../src/logout_pipeline.js";
import { memory_sessions } from "../src/sessions.js";

const USER_ID = "01900000-0000-7000-8000-000000000001";
const OTHER_USER = "01900000-0000-7000-8000-000000000002";
const SESSION_A = "01900000-0000-7000-8000-0000000000aa";
const SESSION_B = "01900000-0000-7000-8000-0000000000bb";

function session_row(id: string, user_id: string) {
  return {
    id,
    user_id,
    refresh_hmac: "hmac",
    session_expires_at: new Date("2026-02-01T00:00:00.000Z"),
    refresh_expires_at: new Date("2026-01-08T00:00:00.000Z"),
    ip_address: "203.0.113.1",
    user_agent: "old-ua",
  };
}

describe("logout pipeline", () => {
  it("deletes only the matching session and emits auth.logout", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const sessions = memory_sessions();
    await sessions.create(session_row(SESSION_A, USER_ID));
    await sessions.create(session_row(SESSION_B, USER_ID));
    await sessions.create(session_row(SESSION_A, OTHER_USER));
    const events: AuditEvent[] = [];
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 60,
      sid: SESSION_A,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = await run_logout_pipeline(
      {
        access_token: token,
        source_ip: "203.0.113.9",
        protocol: "https",
        host: "localhost:8443",
        context_path: "/api/v2/auth/logout",
        user_agent: "logout-ua",
      },
      {
        public_key: publicKey,
        sessions,
        audit: memory_audit_sink(events),
      },
    );
    assert.equal(result.kind, "success");
    assert.equal(sessions.rows.length, 2);
    assert.equal(
      sessions.rows.some((row) => row.id === SESSION_A && row.user_id === USER_ID),
      false,
    );
    assert.equal(
      sessions.rows.some((row) => row.id === SESSION_B && row.user_id === USER_ID),
      true,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event_type, AUTH_LOGOUT);
    assert.equal(events[0]?.user_id, USER_ID);
    assert.equal(events[0]?.ip_address, "203.0.113.9");
    assert.equal(events[0]?.data.user_agent, "logout-ua");
    assert.equal(events[0]?.data.session_id, SESSION_A);
  });

  it("accepts a claim-expired JWT and is idempotent including the event", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const sessions = memory_sessions();
    await sessions.create(session_row(SESSION_A, USER_ID));
    const events: AuditEvent[] = [];
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 60,
      sid: SESSION_A,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const ctx = {
      access_token: token,
      source_ip: "203.0.113.9",
      protocol: "https" as const,
      host: "localhost:8443",
      context_path: "/api/v2/auth/logout",
      user_agent: "logout-ua",
    };
    const deps = {
      public_key: publicKey,
      sessions,
      audit: memory_audit_sink(events),
    };
    assert.equal((await run_logout_pipeline(ctx, deps)).kind, "success");
    assert.equal(sessions.rows.length, 0);
    assert.equal((await run_logout_pipeline(ctx, deps)).kind, "success");
    assert.equal(events.length, 2);
    assert.equal(events[1]?.event_type, AUTH_LOGOUT);
  });

  it("denies a missing or invalid JWT without calling invalidate", async () => {
    const { publicKey } = await generateKeyPair("ES256");
    const sessions = memory_sessions();
    await sessions.create(session_row(SESSION_A, USER_ID));
    const events: AuditEvent[] = [];
    const deps = {
      public_key: publicKey,
      sessions,
      audit: memory_audit_sink(events),
    };
    const missing = await run_logout_pipeline(
      {
        access_token: null,
        source_ip: undefined,
        protocol: undefined,
        host: undefined,
        context_path: "/api/v2/auth/logout",
        user_agent: undefined,
      },
      deps,
    );
    const invalid = await run_logout_pipeline(
      {
        access_token: "not-a-jwt",
        source_ip: undefined,
        protocol: undefined,
        host: undefined,
        context_path: "/api/v2/auth/logout",
        user_agent: undefined,
      },
      deps,
    );
    assert.equal(missing.kind, "denied");
    assert.equal(invalid.kind, "denied");
    assert.equal(sessions.rows.length, 1);
    assert.equal(events.length, 0);
  });

  it("returns internal_error when logout audit emit fails after delete", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const sessions = memory_sessions();
    await sessions.create(session_row(SESSION_A, USER_ID));
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 900,
      sid: SESSION_A,
    });
    const result = await run_logout_pipeline(
      {
        access_token: token,
        source_ip: undefined,
        protocol: undefined,
        host: undefined,
        context_path: "/api/v2/auth/logout",
        user_agent: undefined,
      },
      {
        public_key: publicKey,
        sessions,
        audit: {
          async emit() {
            throw new Error("injected audit failure");
          },
        },
      },
    );
    assert.equal(result.kind, "internal_error");
    assert.equal(sessions.rows.length, 0);
  });
});
