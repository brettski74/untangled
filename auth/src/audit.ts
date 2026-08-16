import { randomUUID } from "node:crypto";
import { open, mkdir, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

export type AuditEvent = {
  event_type: string;
  actor_channel: string;
  outcome: string;
  reason: string;
  severity: string;
  correlation_id: string;
  user_id: string | null;
  ip_address: string | null;
  timestamp: string;
  data: Record<string, unknown>;
};

export type AuditSink = {
  emit: (event: AuditEvent) => Promise<void>;
};

export function new_correlation_id(): string {
  return randomUUID();
}

export function audit_timestamp(now: Date = new Date()): string {
  return now.toISOString();
}

function compact_json(event: AuditEvent): string {
  return JSON.stringify(event);
}

export function memory_audit_sink(events: AuditEvent[]): AuditSink {
  return {
    async emit(event) {
      events.push(event);
    },
  };
}

export function make_file_audit_sink(
  directory: string,
  options: {
    rollover_bytes?: number;
    rollover_seconds?: number;
    pid?: number;
  } = {},
): AuditSink {
  const rollover_bytes = options.rollover_bytes ?? 1_048_576;
  const rollover_seconds = options.rollover_seconds ?? 86_400;
  const pid = options.pid ?? process.pid;
  let seq = 0;
  let handle: FileHandle | null = null;
  let path: string | null = null;
  let opened_at = 0;
  let chain = Promise.resolve();

  async function close_unlocked(): Promise<void> {
    if (handle != null) {
      await handle.close();
      handle = null;
      path = null;
    }
  }

  async function open_new(): Promise<void> {
    await mkdir(directory, { recursive: true });
    seq += 1;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    path = `${directory}/audit-${stamp}-${pid}-${seq}.ndjson`;
    handle = await open(path, "a");
    opened_at = Date.now() / 1000;
  }

  async function ensure_file(): Promise<void> {
    if (handle == null || path == null) {
      await open_new();
      return;
    }
    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      size = 0;
    }
    const age = Date.now() / 1000 - opened_at;
    if (size >= rollover_bytes || age >= rollover_seconds) {
      await close_unlocked();
      await open_new();
    }
  }

  async function write(event: AuditEvent): Promise<void> {
    try {
      await ensure_file();
      if (handle == null) {
        throw new Error("audit file handle missing");
      }
      const line = compact_json(event) + "\n";
      await handle.write(line, undefined, "utf8");
      await handle.sync();
      if (path != null) {
        const size = (await stat(path)).size;
        const age = Date.now() / 1000 - opened_at;
        if (size >= rollover_bytes || age >= rollover_seconds) {
          await close_unlocked();
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      process.stderr.write(`untangled-auth audit write failed: ${message}\n`);
      throw error;
    }
  }

  return {
    emit(event) {
      const done = chain.then(() => write(event));
      chain = done.then(
        () => undefined,
        () => undefined,
      );
      return done;
    },
  };
}

export function login_audit_event(args: {
  success: boolean;
  reason: string;
  user_id: string | null;
  ip_address: string | undefined;
  data: Record<string, unknown>;
  capacity?: boolean;
}): AuditEvent {
  const success = args.success;
  const capacity = args.capacity === true;
  return {
    event_type: success ? "auth.login" : "auth.failed",
    actor_channel: "human",
    outcome: success ? "success" : "failure",
    reason: args.reason,
    severity: success ? "info" : capacity ? "warning" : "notice",
    correlation_id: new_correlation_id(),
    user_id: args.user_id,
    ip_address: args.ip_address ?? null,
    timestamp: audit_timestamp(),
    data: args.data,
  };
}
