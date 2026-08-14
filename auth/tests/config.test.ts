import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cookie_secure_from_env, load_config_from_env } from "../src/config.js";
import { parse_forwarded_for } from "../src/forwarded.js";
import { origin_is_exact_match } from "../src/origin.js";

describe("config", () => {
  it("requires an exact public origin", () => {
    assert.throws(
      () => load_config_from_env({} as NodeJS.ProcessEnv),
      /UNTANGLED_PUBLIC_ORIGIN/,
    );
    assert.throws(
      () =>
        load_config_from_env({
          UNTANGLED_PUBLIC_ORIGIN: "https://127.0.0.1:8443/extra",
        } as NodeJS.ProcessEnv),
      /exact origin/,
    );
    const config = load_config_from_env({
      UNTANGLED_PUBLIC_ORIGIN: "https://127.0.0.1:8443",
    } as NodeJS.ProcessEnv);
    assert.equal(config.public_origin, "https://127.0.0.1:8443");
    assert.equal(config.cookie_secure, true);
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
  const public_origin = "https://127.0.0.1:8443";
  it("matches only the exact origin", () => {
    assert.equal(origin_is_exact_match("https://127.0.0.1:8443", public_origin), true);
    assert.equal(origin_is_exact_match("https://localhost:8443", public_origin), false);
    assert.equal(origin_is_exact_match("https://127.0.0.1:443", public_origin), false);
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
  });
});
