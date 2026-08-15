import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repo_root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const caddyfile = readFileSync(join(repo_root, "deploy/caddy/Caddyfile"), "utf8");

describe("Caddyfile path contract", () => {
  it("routes the auth-session prefix as a path segment, not an auth* glob", () => {
    assert.match(caddyfile, /path \/api\/v2\/auth \/api\/v2\/auth\/\*/);
    assert.doesNotMatch(caddyfile, /\/api\/v2\/auth\*/);
    assert.match(caddyfile, /reverse_proxy auth:3000/);
  });

  it("routes remaining /api/ to the Python API and the rest to SSR", () => {
    assert.match(caddyfile, /handle \/api\/\*/);
    assert.match(caddyfile, /reverse_proxy api:8000/);
    assert.match(caddyfile, /reverse_proxy web:3000/);
    const auth_at = caddyfile.indexOf("path /api/v2/auth");
    const api_at = caddyfile.indexOf("handle /api/*");
    const web_at = caddyfile.lastIndexOf("reverse_proxy web:3000");
    assert.ok(auth_at >= 0 && api_at > auth_at && web_at > api_at);
  });

  it("overwrites inbound forwarded headers instead of passing them through", () => {
    assert.match(caddyfile, /header_up -Forwarded/);
    assert.match(caddyfile, /header_up -X-Forwarded-For/);
    assert.match(caddyfile, /header_up Forwarded /);
    assert.doesNotMatch(caddyfile, /left-most/);
  });

  it("uses the gitignored local certificate pair", () => {
    assert.match(caddyfile, /tls \/etc\/caddy\/certs\/dev\.crt \/etc\/caddy\/certs\/dev\.key/);
  });

  it("canonicalizes 127.0.0.1 and ::1 to localhost without folding Origin in auth", () => {
    assert.match(
      caddyfile,
      /header_regexp Host \(\?i\)\^\(127\\\.0\\\.0\\\.1\|\\\[::1\\\]\|::1\)\(:\\d\+\)\?\$/,
    );
    assert.match(
      caddyfile,
      /redir @not_canonical https:\/\/localhost:\{\$UNTANGLED_PROXY_HOST_PORT:8443\}\{uri\} 308/,
    );
  });
});
