import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  login_audit_event,
  make_file_audit_sink,
} from "../src/audit.js";

const AUDIT_FILENAME_RE = /^audit-\d{8}T\d{6}Z-\d+-\d+\.ndjson$/;

describe("file audit sink", () => {
  it("writes a per-process file audit-{stamp}-{pid}-{seq}.ndjson", async () => {
    const directory = await mkdtemp(join(tmpdir(), "untangled-audit-"));
    try {
      const sink = make_file_audit_sink(directory, { pid: 4242 });
      await sink.emit(
        login_audit_event({
          success: true,
          reason: "login_ok",
          user_id: "01900000-0000-7000-8000-000000000001",
          ip_address: "203.0.113.9",
          data: { username_key: "admin" },
        }),
      );
      const names = await readdir(directory);
      assert.equal(names.length, 1);
      assert.match(names[0] ?? "", AUDIT_FILENAME_RE);
      assert.match(names[0] ?? "", /-4242-1\.ndjson$/);
      const payload = await readFile(join(directory, names[0] ?? ""), "utf8");
      assert.equal(payload.includes("admin-change-me"), false);
      assert.equal(payload.includes("login_ok"), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws on an unwritable directory and logs without the event payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "untangled-audit-ro-"));
    const writes: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return original(chunk, ...(rest as []));
    }) as typeof process.stderr.write;
    try {
      await chmod(directory, 0o555);
      const sink = make_file_audit_sink(directory, { pid: 7 });
      await assert.rejects(
        () =>
          sink.emit(
            login_audit_event({
              success: false,
              reason: "bad_password",
              user_id: null,
              ip_address: "203.0.113.9",
              data: { username_key: "admin", secret: "should-not-be-logged" },
            }),
          ),
        /EACCES|permission denied/i,
      );
      const log = writes.join("");
      assert.match(log, /untangled-auth audit write failed/);
      assert.equal(log.includes("should-not-be-logged"), false);
      assert.equal(log.includes("bad_password"), false);
    } finally {
      process.stderr.write = original;
      await chmod(directory, 0o755).catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
