import {
  bound_event_text,
  logout_audit_event,
  type AuditSink,
} from "./audit.js";
import {
  session_id_claim,
  verify_access_token_for_refresh,
} from "./jwt.js";
import type { SessionRepository } from "./sessions.js";

export type LogoutRequestContext = {
  access_token: string | null;
  source_ip: string | undefined;
  protocol: string | undefined;
  host: string | undefined;
  context_path: string;
  user_agent: string | undefined;
};

export type LogoutPipelineResult =
  | { kind: "success" }
  | { kind: "denied" }
  | { kind: "internal_error" };

export type LogoutPipelineDeps = {
  public_key: CryptoKey;
  sessions: SessionRepository;
  audit: AuditSink;
};

function event_data(
  ctx: LogoutRequestContext,
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

export async function run_logout_pipeline(
  ctx: LogoutRequestContext,
  deps: LogoutPipelineDeps,
): Promise<LogoutPipelineResult> {
  if (ctx.access_token == null) {
    return { kind: "denied" };
  }
  let payload;
  try {
    payload = await verify_access_token_for_refresh(
      deps.public_key,
      ctx.access_token,
    );
  } catch {
    return { kind: "denied" };
  }
  const user_id = payload.sub as string;
  const session_id = session_id_claim(payload);
  if (session_id == null) {
    return { kind: "denied" };
  }

  try {
    await deps.sessions.invalidate(user_id, session_id);
  } catch {
    return { kind: "internal_error" };
  }

  try {
    await deps.audit.emit(
      logout_audit_event({
        user_id,
        ip_address: ctx.source_ip,
        data: event_data(ctx, { session_id }),
      }),
    );
  } catch {
    return { kind: "internal_error" };
  }

  return { kind: "success" };
}
