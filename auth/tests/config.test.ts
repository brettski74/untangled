import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPair, SignJWT } from "jose";

import { load_config_from_env } from "../src/config.js";
import { cookie_secure_from_env } from "../src/cookie_secure.js";
import { parse_forwarded, parse_forwarded_for } from "../src/forwarded.js";
import { sign_access_token, verify_access_token } from "../src/jwt.js";
import { load_private_key, load_public_key } from "../src/keys.js";
import { origin_is_exact_match } from "../src/origin.js";
import { safe_next_path } from "../src/next_path.js";

describe("config", () => {
  it("requires an exact public origin before keys", async () => {
    await assert.rejects(
      () => load_config_from_env({} as NodeJS.ProcessEnv),
      /UNTANGLED_PUBLIC_ORIGIN/,
    );
    await assert.rejects(
      () =>
        load_config_from_env({
          UNTANGLED_PUBLIC_ORIGIN: "https://localhost:8443/extra",
        } as NodeJS.ProcessEnv),
      /exact origin/,
    );
  });

  it("cookie_secure_from_env defaults to secure and rejects typos", () => {
    assert.equal(cookie_secure_from_env(undefined), true);
    assert.equal(cookie_secure_from_env(""), true);
    assert.equal(cookie_secure_from_env("false"), false);
    assert.equal(cookie_secure_from_env("true"), true);
    assert.throws(() => cookie_secure_from_env("yes"), /UNTANGLED_COOKIE_SECURE/);
  });
});

describe("origin", () => {
  const public_origin = "https://localhost:8443";
  it("matches only the exact origin", () => {
    assert.equal(origin_is_exact_match("https://localhost:8443", public_origin), true);
    assert.equal(origin_is_exact_match("https://127.0.0.1:8443", public_origin), false);
    assert.equal(origin_is_exact_match("https://localhost:443", public_origin), false);
    assert.equal(origin_is_exact_match(undefined, public_origin), false);
    assert.equal(origin_is_exact_match("", public_origin), false);
  });
});

describe("forwarded", () => {
  it("reads the for= node Caddy asserted", () => {
    assert.equal(parse_forwarded_for("for=203.0.113.9;proto=https;host=127.0.0.1:8443"), "203.0.113.9");
    assert.equal(parse_forwarded_for('for="[2001:db8::1]";proto=https'), "2001:db8::1");
    assert.equal(parse_forwarded_for("for=198.51.100.10:1234"), "198.51.100.10");
    assert.equal(parse_forwarded_for(undefined), undefined);
    assert.equal(parse_forwarded_for(""), undefined);
    assert.deepEqual(
      parse_forwarded("for=203.0.113.9;proto=https;host=localhost:8443"),
      { for: "203.0.113.9", proto: "https", host: "localhost:8443" },
    );
  });
});

describe("safe_next_path", () => {
  it("allows same-origin relative paths", () => {
    assert.equal(safe_next_path("/"), "/");
    assert.equal(safe_next_path("/incident"), "/incident");
    assert.equal(safe_next_path("/a?b=1"), "/a?b=1");
  });

  it("rejects open redirects", () => {
    assert.equal(safe_next_path("//evil.example"), "/");
    assert.equal(safe_next_path("https://evil.example"), "/");
    assert.equal(safe_next_path("http://evil.example/x"), "/");
    assert.equal(safe_next_path(null), "/");
    assert.equal(safe_next_path(""), "/");
  });
});

describe("keys", () => {
  it("fails closed when private key material is missing", async () => {
    await assert.rejects(
      () => load_private_key({} as NodeJS.ProcessEnv),
      /UNTANGLED_JWT_PRIVATE_KEY/,
    );
  });

  it("fails closed when public key material is missing", async () => {
    await assert.rejects(
      () => load_public_key({} as NodeJS.ProcessEnv),
      /UNTANGLED_JWT_PUBLIC_KEY/,
    );
  });
});

describe("jwt", () => {
  it("round-trips ES256 and rejects a token from a different P-256 key", async () => {
    const issuer = await generateKeyPair("ES256");
    const other = await generateKeyPair("ES256");
    const user_id = "01900000-0000-7000-8000-000000000001";
    const token = await sign_access_token(issuer.privateKey, user_id, {
      ttl_seconds: 900,
      sid: "01900000-0000-7000-8000-0000000000aa",
    });
    const payload = await verify_access_token(issuer.publicKey, token);
    assert.equal(payload.sub, user_id);
    assert.equal(payload.typ, "access");
    assert.equal(payload.sid, "01900000-0000-7000-8000-0000000000aa");
    assert.equal(payload.password_change_required, undefined);
    await assert.rejects(() => verify_access_token(other.publicKey, token));
  });

  it("omits the must-change claim unless true, and can reissue with the same exp", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const user_id = "01900000-0000-7000-8000-000000000001";
    const with_claim = await sign_access_token(privateKey, user_id, {
      ttl_seconds: 900,
      password_change_required: true,
    });
    const payload = await verify_access_token(publicKey, with_claim);
    assert.equal(payload.password_change_required, true);
    const reissued = await sign_access_token(privateKey, user_id, {
      exp: payload.exp as number,
      sid: "01900000-0000-7000-8000-0000000000aa",
    });
    const again = await verify_access_token(publicKey, reissued);
    assert.equal(again.exp, payload.exp);
    assert.equal(again.sid, "01900000-0000-7000-8000-0000000000aa");
    assert.equal(again.password_change_required, undefined);
  });

  it("rejects HS256 and missing exp", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const hs = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("01900000-0000-7000-8000-000000000001")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("not-a-real-hmac-secret-value!!"));
    await assert.rejects(() => verify_access_token(publicKey, hs));

    const no_exp = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject("01900000-0000-7000-8000-000000000001")
      .setIssuedAt()
      .sign(privateKey);
    await assert.rejects(() => verify_access_token(publicKey, no_exp));
  });
});
