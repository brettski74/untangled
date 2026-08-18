import {
  bound_event_text,
  refresh_audit_event,
  refresh_reuse_audit_event,
  type AuditSink,
} from "./audit.js";
import { remaining_wait_ms } from "./padding.js";
import {
  hmac_refresh_token,
  mint_refresh_token,
} from "./refresh_hmac.js";
import {
  password_change_required,
  session_id_claim,
  sign_access_token,
  verify_access_token_for_refresh,
} from "./jwt.js";
import type { SessionRepository } from "./sessions.js";
import type { AuthRuntimeSettings } from "./system_config.js";

export const REFRESH_RETRY = true;

export type RefreshRequestContext = {
  access_token: string | null;
  refresh_token: string | null;
  source_ip: string | undefined;
  protocol: string | undefined;
  host: string | undefined;
  context_path: string;
  user_agent: string | undefined;
};

export type RefreshPipelineResult =
  | {
      kind: "success";
      refresh_token: string;
      access_token: string | null;
      refresh_max_age: number;
      access_max_age: number;
    }
  | { kind: "soft" }
  | { kind: "hard" }
  | { kind: "unavailable" }
  | { kind: "internal_error" };

export type RefreshPipelineDeps = {
  settings: AuthRuntimeSettings;
  public_key: CryptoKey;
  private_key: CryptoKey;
  refresh_hmac_secret: Buffer;
  sessions: SessionRepository;
  audit: AuditSink;
  draw_t: (min: number, max: number) => number;
  now_ms: () => number;
  sleep: (ms: number) => Promise<void>;
};

function event_data(
  ctx: RefreshRequestContext,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    context_path: ctx.context_path,
    protocol: ctx.protocol ?? null,
    host: ctx.host ?? null,
    user_agent:
      ctx.user_agent == null || ctx.user_agent === ""
        ? null
        : bound_event_text(ctx.user_agent),
    ...extra,
  };
}

export async function run_refresh_pipeline(
  ctx: RefreshRequestContext,
  deps: RefreshPipelineDeps,
): Promise<RefreshPipelineResult> {
  let t_ms: number;
  try {
    t_ms = deps.draw_t(
      deps.settings.session_refresh_process_time_minimum,
      deps.settings.session_refresh_process_time_maximum,
    );
  } catch {
    return { kind: "internal_error" };
  }
  const started_ms = deps.now_ms();

  async function wait_hard(): Promise<void> {
    await deps.sleep(remaining_wait_ms(t_ms, 0, deps.now_ms() - started_ms));
  }

  async function fail_hard(
    reason: string,
    user_id: string | null,
    invalidate: { user_id: string; session_id: string } | null,
  ): Promise<RefreshPipelineResult> {
    try {
      await deps.audit.emit(
        refresh_audit_event({
          success: false,
          reason,
          user_id,
          ip_address: ctx.source_ip,
          data: event_data(ctx),
        }),
      );
    } catch {
      if (invalidate != null) {
        try {
          await deps.sessions.invalidate(invalidate.user_id, invalidate.session_id);
        } catch {
          // Prefer the audit-failure 503 over a secondary error.
        }
      }
      await wait_hard();
      return { kind: "unavailable" };
    }
    await wait_hard();
    return { kind: "hard" };
  }

  if (ctx.access_token == null) {
    return fail_hard("missing_cookie", null, null);
  }

  let payload;
  try {
    payload = await verify_access_token_for_refresh(
      deps.public_key,
      ctx.access_token,
    );
  } catch {
    return fail_hard("invalid_jwt", null, null);
  }
  const user_id = payload.sub as string;
  const session_id = session_id_claim(payload);
  if (session_id == null) {
    return fail_hard("invalid_jwt", user_id, null);
  }
  const identifiable = { user_id, session_id };
  if (ctx.refresh_token == null) {
    return fail_hard("missing_cookie", user_id, identifiable);
  }
  if (password_change_required(payload)) {
    return fail_hard("must_change", user_id, identifiable);
  }

  const old_hmac = hmac_refresh_token(deps.refresh_hmac_secret, ctx.refresh_token);
  const new_refresh = mint_refresh_token();
  const new_hmac = hmac_refresh_token(deps.refresh_hmac_secret, new_refresh);
  const now = new Date();
  const ip_address = ctx.source_ip ?? null;
  const user_agent =
    ctx.user_agent == null || ctx.user_agent === "" ? null : ctx.user_agent;

  let outcome;
  try {
    outcome = await deps.sessions.attempt_rotate({
      old_hmac,
      new_hmac,
      user_id,
      session_id,
      now,
      refresh_ttl_seconds: deps.settings.session_refresh_ttl_seconds,
      reuse_grace_seconds: deps.settings.session_refresh_reuse_grace_seconds,
      reuse_window_seconds: deps.settings.session_refresh_reuse_window_seconds,
      ip_address,
      user_agent,
    });
  } catch {
    return { kind: "internal_error" };
  }

  if (outcome.kind === "soft_reuse") {
    return { kind: "soft" };
  }
  if (outcome.kind === "hard_reuse") {
    try {
      await deps.audit.emit(
        refresh_reuse_audit_event({
          user_id,
          ip_address: ctx.source_ip,
          data: event_data(ctx),
        }),
      );
    } catch {
      await wait_hard();
      return { kind: "unavailable" };
    }
    await wait_hard();
    return { kind: "hard" };
  }
  if (outcome.kind === "expired") {
    return fail_hard("expired_session", user_id, { user_id, session_id });
  }
  if (outcome.kind !== "rotated") {
    return fail_hard("unknown_token", user_id, identifiable);
  }

  const access_expired =
    typeof payload.exp === "number" &&
    payload.exp <= Math.floor(now.getTime() / 1000);
  const remaining = Math.max(
    1,
    Math.floor(outcome.refresh_expires_at.getTime() / 1000) -
      Math.floor(now.getTime() / 1000),
  );
  let access_token: string | null = null;
  if (access_expired) {
    try {
      access_token = await sign_access_token(deps.private_key, user_id, {
        ttl_seconds: deps.settings.session_access_ttl_seconds,
        now,
        sid: session_id,
      });
    } catch {
      try {
        await deps.sessions.invalidate(user_id, session_id);
      } catch {
        // Fall through to internal error.
      }
      return { kind: "internal_error" };
    }
  }

  try {
    await deps.audit.emit(
      refresh_audit_event({
        success: true,
        reason: "refresh_ok",
        user_id,
        ip_address: ctx.source_ip,
        data: event_data(ctx),
      }),
    );
  } catch {
    try {
      await deps.sessions.invalidate(user_id, session_id);
    } catch {
      // Prefer the audit-failure 503.
    }
    await wait_hard();
    return { kind: "unavailable" };
  }

  return {
    kind: "success",
    refresh_token: new_refresh,
    access_token,
    refresh_max_age: remaining,
    access_max_age: remaining,
  };
}
