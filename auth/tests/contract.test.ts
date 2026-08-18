import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  AUTH_CSRF_DENIED,
  AUTH_LOGOUT,
  AUTH_RATE_LIMIT_TRIP,
  AUTH_REFRESH,
  AUTH_REFRESH_REUSE,
} from "../src/audit.js";
import {
  LOGIN_HASH_CONCURRENCY_DEFAULT,
  LOGIN_HASH_CONCURRENCY_MAX,
  LOGIN_HASH_CONCURRENCY_MIN,
  LOGIN_MAXIMUM_FAILED_COUNT_DEFAULT,
  LOGIN_PROCESS_TIME_MAXIMUM_DEFAULT,
  LOGIN_PROCESS_TIME_MAXIMUM_MIN,
  LOGIN_PROCESS_TIME_MINIMUM_DEFAULT,
  LOGIN_PROCESS_TIME_MINIMUM_MIN,
  PASSWORD_SCHEMA_MAX_CHARS,
  SYSTEM_CONFIG_ID,
  SYSTEM_USER_ID,
} from "../src/login_settings.js";
import {
  SESSION_ACCESS_TTL_DEFAULT,
  SESSION_ACCESS_TTL_MAX,
  SESSION_ACCESS_TTL_MIN,
  SESSION_MAX_REFRESH_RETRIES_DEFAULT,
  SESSION_REFRESH_CLEANUP_DEFAULT,
  SESSION_REFRESH_PROCESS_TIME_MAXIMUM_DEFAULT,
  SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MAX,
  SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MIN,
  SESSION_REFRESH_PROCESS_TIME_MINIMUM_DEFAULT,
  SESSION_REFRESH_PROCESS_TIME_MINIMUM_MAX,
  SESSION_REFRESH_PROCESS_TIME_MINIMUM_MIN,
  SESSION_REFRESH_REUSE_GRACE_DEFAULT,
  SESSION_REFRESH_REUSE_GRACE_MAX,
  SESSION_REFRESH_REUSE_GRACE_MIN,
  SESSION_REFRESH_REUSE_WINDOW_DEFAULT,
  SESSION_REFRESH_TTL_DEFAULT,
  SESSION_TOTAL_TTL_DEFAULT,
  SESSION_TOTAL_TTL_MAX,
} from "../src/session_settings.js";

const repo_root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("login settings contract", () => {
  it("matches YAML defaults and the well-known system_config id", () => {
    const yaml = readFileSync(
      join(repo_root, "backend/class-definitions/system_config.yaml"),
      "utf8",
    );
    assert.equal(SYSTEM_CONFIG_ID, "01900000-0000-7000-8000-000000000050");
    assert.equal(SYSTEM_USER_ID, "01900000-0000-7000-8000-000000000006");
    const users_src = readFileSync(
      join(repo_root, "auth/src/users.ts"),
      "utf8",
    );
    assert.match(users_src, /updated_by = \$3::uuid/);
    assert.match(users_src, /SYSTEM_USER_ID, id/);
    assert.match(yaml, new RegExp(`id = '\\$\\{system_config_id\\}'`));
    assert.match(yaml, /login_process_time_minimum:\n(?:.|\n)*create_default: 300/);
    assert.equal(LOGIN_PROCESS_TIME_MINIMUM_DEFAULT, 300);
    assert.equal(LOGIN_PROCESS_TIME_MINIMUM_MIN, 100);
    assert.equal(LOGIN_PROCESS_TIME_MAXIMUM_DEFAULT, 500);
    assert.equal(LOGIN_PROCESS_TIME_MAXIMUM_MIN, 200);
    assert.equal(LOGIN_HASH_CONCURRENCY_DEFAULT, 4);
    assert.equal(LOGIN_HASH_CONCURRENCY_MIN, 1);
    assert.equal(LOGIN_HASH_CONCURRENCY_MAX, 10);
    assert.equal(LOGIN_MAXIMUM_FAILED_COUNT_DEFAULT, 5);
    assert.match(yaml, /login_rate_limit_per_user_sample_period:\n(?:.|\n)*create_default: 300/);
    assert.match(yaml, /login_rate_limit_lockout_seconds:\n(?:.|\n)*create_default: 900/);
    assert.match(yaml, /login_rate_limit_max_kib:\n(?:.|\n)*create_default: 16384/);
    assert.match(yaml, /login_hash_concurrency_limit:\n(?:.|\n)*max_value: 10/);
    const user_yaml = readFileSync(
      join(repo_root, "backend/class-definitions/user.yaml"),
      "utf8",
    );
    assert.match(user_yaml, /username ~ '\^\[a-z0-9_\]\{3,32\}\$'::text/);
    assert.match(user_yaml, /password_expires_at:\n(?:.|\n)*create_default: \$\{now\}/);
    assert.match(yaml, /password_expiry_days:\n(?:.|\n)*create_default: 90/);
    assert.match(yaml, /password_grace_days:\n(?:.|\n)*create_default: 14/);
    assert.match(yaml, /session_access_ttl_seconds:\n(?:.|\n)*create_default: 900/);
    assert.match(
      yaml,
      /session_refresh_reuse_window_seconds > session_refresh_reuse_grace_seconds/,
    );
    assert.match(
      yaml,
      /session_refresh_process_time_minimum <= session_refresh_process_time_maximum/,
    );
    assert.equal(SESSION_ACCESS_TTL_MIN, 60);
    assert.equal(SESSION_ACCESS_TTL_DEFAULT, 900);
    assert.equal(SESSION_ACCESS_TTL_MAX, 86400);
    assert.equal(SESSION_REFRESH_TTL_DEFAULT, 604800);
    assert.equal(SESSION_TOTAL_TTL_DEFAULT, 2592000);
    assert.equal(SESSION_TOTAL_TTL_MAX, 15552000);
    assert.equal(SESSION_REFRESH_REUSE_GRACE_MIN, 5);
    assert.equal(SESSION_REFRESH_REUSE_GRACE_DEFAULT, 15);
    assert.equal(SESSION_REFRESH_REUSE_GRACE_MAX, 60);
    assert.equal(SESSION_REFRESH_REUSE_WINDOW_DEFAULT, 86400);
    assert.equal(SESSION_MAX_REFRESH_RETRIES_DEFAULT, 5);
    assert.equal(SESSION_REFRESH_CLEANUP_DEFAULT, 14400);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MINIMUM_MIN, 100);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MINIMUM_DEFAULT, 300);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MINIMUM_MAX, 500);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MIN, 200);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MAXIMUM_DEFAULT, 500);
    assert.equal(SESSION_REFRESH_PROCESS_TIME_MAXIMUM_MAX, 1000);
    assert.doesNotMatch(yaml, /validate_session_/);
  });

  it("shares auth.csrf_denied with the Python EventType catalog", () => {
    const types = readFileSync(
      join(repo_root, "backend/src/untangled/audit/types.py"),
      "utf8",
    );
    assert.equal(AUTH_CSRF_DENIED, "auth.csrf_denied");
    assert.match(types, /AUTH_CSRF_DENIED = "auth.csrf_denied"/);
    assert.equal(AUTH_RATE_LIMIT_TRIP, "auth.rate_limit_trip");
    assert.match(types, /AUTH_RATE_LIMIT_TRIP = "auth.rate_limit_trip"/);
    assert.equal(AUTH_REFRESH, "auth.refresh");
    assert.match(types, /AUTH_REFRESH = "auth.refresh"/);
    assert.equal(AUTH_REFRESH_REUSE, "auth.refresh_reuse");
    assert.match(types, /AUTH_REFRESH_REUSE = "auth.refresh_reuse"/);
    assert.equal(AUTH_LOGOUT, "auth.logout");
    assert.match(types, /AUTH_LOGOUT = "auth.logout"/);
  });

  it("auth image stays USER node without a root entrypoint", () => {
    const dockerfile = readFileSync(join(repo_root, "auth/Dockerfile"), "utf8");
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /uid 1000/);
    assert.doesNotMatch(dockerfile, /ENTRYPOINT/);
    assert.doesNotMatch(dockerfile, /su-exec/);
    assert.doesNotMatch(dockerfile, /refresh_secret/);
  });

  it("mounts the refresh HMAC secret on auth only", () => {
    const compose = readFileSync(join(repo_root, "compose.yaml"), "utf8");
    assert.match(
      compose,
      /UNTANGLED_REFRESH_HMAC_SECRET_PATH: \/jwt\/refresh_secret\.b64/,
    );
    assert.match(
      compose,
      /\.\/deploy\/jwt\/refresh_secret\.b64:\/jwt\/refresh_secret\.b64:ro/,
    );
    const api_block = compose.split("\n  web:")[0] ?? "";
    const web_block = compose.split("\n  auth:")[0]?.split("\n  web:")[1] ?? "";
    assert.doesNotMatch(api_block, /refresh_secret/);
    assert.doesNotMatch(web_block, /refresh_secret/);
    assert.doesNotMatch(compose, /UNTANGLED_REFRESH_HMAC_SECRET:/);
  });

  it("Make refresh HMAC target is a dependency of auth-start paths", () => {
    const makefile = readFileSync(join(repo_root, "Makefile"), "utf8");
    assert.match(makefile, /REFRESH_HMAC_SECRET := deploy\/jwt\/refresh_secret\.b64/);
    assert.match(makefile, /openssl rand -base64 32/);
    assert.match(
      makefile,
      /up: .*\$\(REFRESH_HMAC_SECRET\)/,
    );
    assert.match(makefile, /auth-dev: auth-install local-jwt-keys local-refresh-hmac/);
    assert.doesNotMatch(makefile, /validate_session_/);
  });

  it("uses schema max 256 for oversize password, not live config", () => {
    const yaml = readFileSync(
      join(repo_root, "backend/class-definitions/system_config.yaml"),
      "utf8",
    );
    assert.match(yaml, /password_maximum_chars:\n(?:.|\n)*max_value: 256/);
    assert.equal(PASSWORD_SCHEMA_MAX_CHARS, 256);
  });
});
