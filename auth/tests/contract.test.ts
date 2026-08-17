import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { AUTH_CSRF_DENIED, AUTH_RATE_LIMIT_TRIP } from "../src/audit.js";
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
  });

  it("auth image stays USER node without a root entrypoint", () => {
    const dockerfile = readFileSync(join(repo_root, "auth/Dockerfile"), "utf8");
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /uid 1000/);
    assert.doesNotMatch(dockerfile, /ENTRYPOINT/);
    assert.doesNotMatch(dockerfile, /su-exec/);
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
