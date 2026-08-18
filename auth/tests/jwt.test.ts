import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateKeyPair } from "jose";

import {
  ACCESS_TOKEN_IAT_SKEW_SECONDS,
  sign_access_token,
  verify_access_token,
  verify_access_token_for_refresh,
} from "../src/jwt.js";

const USER_ID = "01900000-0000-7000-8000-000000000001";
const SESSION_ID = "01900000-0000-7000-8000-0000000000aa";

describe("verify_access_token_for_refresh", () => {
  it("accepts a claim-expired access token with sid", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const now = new Date("2026-01-01T00:20:00.000Z");
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 60,
      sid: SESSION_ID,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    await assert.rejects(verify_access_token(publicKey, token));
    const payload = await verify_access_token_for_refresh(publicKey, token, now);
    assert.equal(payload.sub, USER_ID);
    assert.equal(payload.sid, SESSION_ID);
  });

  it("rejects a tampered token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 900,
      sid: SESSION_ID,
    });
    const parts = token.split(".");
    parts[2] = (parts[2] ?? "").replace(/[A-Za-z]/, (ch) =>
      ch === "A" ? "B" : "A",
    );
    await assert.rejects(
      verify_access_token_for_refresh(publicKey, parts.join(".")),
    );
  });

  it("rejects the wrong typ", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const { SignJWT } = await import("jose");
    const issued = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ typ: "refresh", sid: SESSION_ID })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(USER_ID)
      .setIssuedAt(issued)
      .setExpirationTime(issued + 900)
      .sign(privateKey);
    await assert.rejects(verify_access_token_for_refresh(publicKey, token));
  });

  it("rejects inverted exp/iat", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const { SignJWT } = await import("jose");
    const issued = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ typ: "access", sid: SESSION_ID })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(USER_ID)
      .setIssuedAt(issued + 100)
      .setExpirationTime(issued + 50)
      .sign(privateKey);
    await assert.rejects(verify_access_token_for_refresh(publicKey, token));
  });

  it("accepts a 6-day-old default-span access token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const issued = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-07T12:00:00.000Z");
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 900,
      sid: SESSION_ID,
      now: issued,
    });
    const payload = await verify_access_token_for_refresh(publicKey, token, now);
    assert.equal(payload.sub, USER_ID);
    assert.equal(payload.sid, SESSION_ID);
  });

  it("rejects a materially future iat", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const token = await sign_access_token(privateKey, USER_ID, {
      ttl_seconds: 900,
      sid: SESSION_ID,
      now: new Date(now.getTime() + (ACCESS_TOKEN_IAT_SKEW_SECONDS + 30) * 1000),
    });
    await assert.rejects(verify_access_token_for_refresh(publicKey, token, now));
  });
});
