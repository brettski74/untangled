import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash, argon2id } from "argon2";

import { verify_password } from "../src/passwords.js";

describe("passwords", () => {
  it("verifies argon2id hashes off a Promise (native threadpool)", async () => {
    const hashed = await hash("secret-password", { type: argon2id });
    assert.match(hashed, /^\$argon2id\$/);
    assert.equal(await verify_password(hashed, "secret-password"), true);
    assert.equal(await verify_password(hashed, "wrong-password"), false);
    assert.equal(await verify_password("not-a-hash", "secret-password"), false);
  });
});
