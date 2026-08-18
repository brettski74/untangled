import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { login_session_times } from "../src/session_issue.js";

describe("login session times", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("caps idle refresh by the hard session cap", () => {
    const times = login_session_times({
      now,
      access_ttl_seconds: 900,
      refresh_ttl_seconds: 604800,
      total_ttl_seconds: 2592000,
      must_change: false,
    });
    assert.equal(times.jwt_ttl_seconds, 900);
    assert.equal(times.refresh_max_age, 604800);
    assert.equal(times.access_max_age, 604800);
    assert.equal(times.refresh_expires_at.toISOString(), "2026-01-08T00:00:00.000Z");
    assert.equal(times.session_expires_at.toISOString(), "2026-01-31T00:00:00.000Z");
  });

  it("uses JWT lifetime for must-change and omits refresh Max-Age", () => {
    const times = login_session_times({
      now,
      access_ttl_seconds: 900,
      refresh_ttl_seconds: 604800,
      total_ttl_seconds: 2592000,
      must_change: true,
    });
    assert.equal(times.refresh_max_age, null);
    assert.equal(times.access_max_age, 900);
    assert.equal(times.refresh_expires_at.toISOString(), "2026-01-01T00:15:00.000Z");
  });

  it("caps refresh remaining when total TTL is shorter than idle TTL", () => {
    const times = login_session_times({
      now,
      access_ttl_seconds: 60,
      refresh_ttl_seconds: 600,
      total_ttl_seconds: 300,
      must_change: false,
    });
    assert.equal(times.refresh_max_age, 300);
    assert.equal(times.access_max_age, 300);
    assert.equal(times.refresh_expires_at.getTime(), times.session_expires_at.getTime());
  });
});
