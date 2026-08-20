import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";

import {
  ACCESS_TOKEN_IAT_SKEW_SECONDS,
  verify_access_jwt,
} from "./access_jwt";

const USER_ID = "01900000-0000-7000-8000-000000000001";
const SESSION_ID = "01900000-0000-7000-8000-0000000000aa";

async function sign_access(
  private_key: CryptoKey,
  args: {
    ttl_seconds: number;
    sid?: string;
    now?: Date;
    typ?: string;
    sub?: string;
    iat?: number;
    exp?: number;
  },
): Promise<string> {
  const issued = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const iat = args.iat ?? issued;
  const exp = args.exp ?? iat + args.ttl_seconds;
  return new SignJWT({
    typ: args.typ ?? "access",
    sid: args.sid,
  })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(args.sub ?? USER_ID)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(private_key);
}

describe("verify_access_jwt (SSR copy of auth wrapper)", () => {
  it("accepts an unexpired access token with sid", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const token = await sign_access(privateKey, {
      ttl_seconds: 900,
      sid: SESSION_ID,
    });
    const result = await verify_access_jwt(publicKey, token);
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") {
      return;
    }
    expect(result.payload.sub).toBe(USER_ID);
    expect(result.payload.sid).toBe(SESSION_ID);
  });

  it("classifies claim-expired but otherwise valid as expired", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const now = new Date("2026-01-01T00:20:00.000Z");
    const token = await sign_access(privateKey, {
      ttl_seconds: 60,
      sid: SESSION_ID,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = await verify_access_jwt(publicKey, token, now);
    expect(result.kind).toBe("expired");
  });

  it("rejects a tampered token as invalid, not expired", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const token = await sign_access(privateKey, {
      ttl_seconds: 900,
      sid: SESSION_ID,
    });
    const parts = token.split(".");
    parts[2] = (parts[2] ?? "").replace(/[A-Za-z]/, (ch) =>
      ch === "A" ? "B" : "A",
    );
    const result = await verify_access_jwt(publicKey, parts.join("."));
    expect(result.kind).toBe("invalid");
  });

  it("rejects the wrong typ even when exp is past", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const issued = Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000);
    const token = await sign_access(privateKey, {
      ttl_seconds: 60,
      sid: SESSION_ID,
      typ: "refresh",
      iat: issued,
      exp: issued + 60,
    });
    const now = new Date("2026-01-01T00:20:00.000Z");
    const result = await verify_access_jwt(publicKey, token, now);
    expect(result.kind).toBe("invalid");
  });

  it("rejects missing sid as invalid, including when exp is past", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const now = new Date("2026-01-01T00:20:00.000Z");
    const token = await sign_access(privateKey, {
      ttl_seconds: 60,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = await verify_access_jwt(publicKey, token, now);
    expect(result.kind).toBe("invalid");
  });

  it("rejects inverted exp/iat", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const issued = Math.floor(Date.now() / 1000);
    const token = await sign_access(privateKey, {
      ttl_seconds: 1,
      sid: SESSION_ID,
      iat: issued + 100,
      exp: issued + 50,
    });
    const result = await verify_access_jwt(publicKey, token);
    expect(result.kind).toBe("invalid");
  });

  it("rejects a materially future iat", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const token = await sign_access(privateKey, {
      ttl_seconds: 900,
      sid: SESSION_ID,
      now: new Date(now.getTime() + (ACCESS_TOKEN_IAT_SKEW_SECONDS + 30) * 1000),
    });
    const result = await verify_access_jwt(publicKey, token, now);
    expect(result.kind).toBe("invalid");
  });
});
