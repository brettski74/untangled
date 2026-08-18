import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { new_uuid7 } from "../src/uuidv7.js";

describe("uuidv7", () => {
  it("returns a version-7 UUID string", () => {
    const value = new_uuid7(1_700_000_000_000);
    assert.match(
      value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const bytes = Buffer.from(value.replaceAll("-", ""), "hex");
    assert.equal(bytes[6]! >> 4, 7);
    assert.equal((bytes[8]! >> 6) & 0b11, 0b10);
  });
});
