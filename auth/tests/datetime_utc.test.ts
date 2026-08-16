import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { utc_seconds } from "../src/datetime_utc.js";

describe("utc_seconds", () => {
  it("keeps the same second below 500ms", () => {
    const rounded = utc_seconds(new Date("2026-08-16T12:00:00.499Z"));
    assert.equal(rounded.toISOString(), "2026-08-16T12:00:00.000Z");
    assert.equal(rounded.getUTCMilliseconds(), 0);
  });

  it("rounds 500ms up to the next second", () => {
    const rounded = utc_seconds(new Date("2026-08-16T12:00:00.500Z"));
    assert.equal(rounded.toISOString(), "2026-08-16T12:00:01.000Z");
    assert.equal(rounded.getUTCMilliseconds(), 0);
  });
});
