import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOGIN_HASH_CONCURRENCY_MAX } from "../src/login_settings.js";
import { fold_username, username_is_valid } from "../src/username.js";
import {
  UV_THREADPOOL_HEADROOM,
  UV_THREADPOOL_MIN,
  ensure_uv_threadpool,
} from "../src/uv_threadpool.js";

describe("username rules", () => {
  it("folds and accepts 3–32 alnum/underscore", () => {
    assert.equal(fold_username("  Admin "), "admin");
    assert.equal(username_is_valid("admin"), true);
    assert.equal(username_is_valid("read_only"), true);
    assert.equal(username_is_valid("a".repeat(3)), true);
    assert.equal(username_is_valid("a".repeat(32)), true);
  });

  it("rejects length and charset", () => {
    assert.equal(username_is_valid("ab"), false);
    assert.equal(username_is_valid("a".repeat(33)), false);
    assert.equal(username_is_valid("admin-user"), false);
    assert.equal(username_is_valid(""), false);
  });
});

describe("uv threadpool", () => {
  it("sizes to hash max plus headroom and raises a too-small env", () => {
    assert.equal(UV_THREADPOOL_MIN, LOGIN_HASH_CONCURRENCY_MAX + UV_THREADPOOL_HEADROOM);
    assert.equal(UV_THREADPOOL_MIN, 12);
    const env: NodeJS.ProcessEnv = { UV_THREADPOOL_SIZE: "4" };
    assert.equal(ensure_uv_threadpool(env), 12);
    assert.equal(env.UV_THREADPOOL_SIZE, "12");
  });

  it("leaves a larger existing value", () => {
    const env: NodeJS.ProcessEnv = { UV_THREADPOOL_SIZE: "16" };
    assert.equal(ensure_uv_threadpool(env), 16);
  });
});
