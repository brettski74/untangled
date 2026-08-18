import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  hmac_refresh_token,
  load_refresh_hmac_secret,
  mint_refresh_token,
  MIN_REFRESH_HMAC_SECRET_BYTES,
  REFRESH_TOKEN_BYTES,
} from "../src/refresh_hmac.js";

function write_secret(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "untangled-hmac-"));
  const path = join(dir, "refresh_secret.b64");
  writeFileSync(path, contents);
  return path;
}

describe("refresh HMAC secret file", () => {
  it("fails closed when the path env is missing", () => {
    assert.throws(
      () => load_refresh_hmac_secret({} as NodeJS.ProcessEnv),
      /UNTANGLED_REFRESH_HMAC_SECRET_PATH is required/,
    );
  });

  it("fails closed when the file is missing", () => {
    assert.throws(
      () =>
        load_refresh_hmac_secret({
          UNTANGLED_REFRESH_HMAC_SECRET_PATH: "/no/such/refresh_secret.b64",
        } as NodeJS.ProcessEnv),
      /unreadable/,
    );
  });

  it("fails closed when the file is empty", () => {
    const path = write_secret("");
    assert.throws(
      () =>
        load_refresh_hmac_secret({
          UNTANGLED_REFRESH_HMAC_SECRET_PATH: path,
        } as NodeJS.ProcessEnv),
      /empty/,
    );
  });

  it("fails closed when the file is not base64", () => {
    const path = write_secret("%%%%not-base64%%%%");
    assert.throws(
      () =>
        load_refresh_hmac_secret({
          UNTANGLED_REFRESH_HMAC_SECRET_PATH: path,
        } as NodeJS.ProcessEnv),
      /base64-encoded secret bytes/,
    );
  });

  it("fails closed when decoded length is under 32 bytes", () => {
    const path = write_secret(Buffer.alloc(16).toString("base64"));
    assert.throws(
      () =>
        load_refresh_hmac_secret({
          UNTANGLED_REFRESH_HMAC_SECRET_PATH: path,
        } as NodeJS.ProcessEnv),
      /at least 32 bytes/,
    );
  });

  it("loads raw decoded bytes and ignores wrapping whitespace", () => {
    const secret = Buffer.alloc(MIN_REFRESH_HMAC_SECRET_BYTES, 7);
    const wrapped = `${secret.toString("base64").slice(0, 16)}\n${secret.toString("base64").slice(16)}\n`;
    const path = write_secret(wrapped);
    const loaded = load_refresh_hmac_secret({
      UNTANGLED_REFRESH_HMAC_SECRET_PATH: path,
    } as NodeJS.ProcessEnv);
    assert.deepEqual(loaded, secret);
  });

  it("does not read an inline secret env", () => {
    assert.throws(
      () =>
        load_refresh_hmac_secret({
          UNTANGLED_REFRESH_HMAC_SECRET: Buffer.alloc(32).toString("base64"),
        } as NodeJS.ProcessEnv),
      /UNTANGLED_REFRESH_HMAC_SECRET_PATH is required/,
    );
  });
});

describe("refresh token mint and HMAC", () => {
  it("mints at least 32 bytes of CSPRNG encoded as base64url", () => {
    const token = mint_refresh_token();
    const decoded = Buffer.from(token, "base64url");
    assert.equal(decoded.byteLength, REFRESH_TOKEN_BYTES);
    assert.notEqual(token, mint_refresh_token());
  });

  it("HMACs the token string as lowercase hex", () => {
    const secret = Buffer.alloc(32, 3);
    const digest = hmac_refresh_token(secret, "refresh-token");
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(digest, hmac_refresh_token(secret, "refresh-token"));
    assert.notEqual(digest, hmac_refresh_token(secret, "other-token"));
  });
});
