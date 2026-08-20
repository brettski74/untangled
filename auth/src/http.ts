import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import {
  bound_event_text,
  csrf_denied_audit_event,
  CSRF_DENIED_CSRF,
  CSRF_DENIED_ORIGIN,
} from "./audit.js";
import type { AuthConfig } from "./config.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  access_cookie,
  csrf_cookie,
  expire_access_cookie,
  expire_refresh_cookie,
  parse_cookie_header,
  refresh_cookie,
} from "./cookies.js";
import { random_token, tokens_equal } from "./csrf.js";
import { request_identity } from "./forwarded.js";
import {
  session_id_claim,
  sign_access_token,
  verify_access_jwt,
} from "./jwt.js";
import { hmac_refresh_token, mint_refresh_token } from "./refresh_hmac.js";
import { run_logout_pipeline } from "./logout_pipeline.js";
import { REFRESH_RETRY, run_refresh_pipeline } from "./refresh_pipeline.js";
import { ACCESS_DENIED, SERVICE_UNAVAILABLE } from "./login_settings.js";
import { run_login_pipeline } from "./login_pipeline.js";
import { login_session_times } from "./session_issue.js";
import { new_uuid7 } from "./uuidv7.js";
import { safe_next_path } from "./next_path.js";
import { origin_is_exact_match } from "./origin.js";
import {
  PASSWORD_CHANGE_FAILED,
  PASSWORD_CHANGE_OK,
  execute_change_password,
  password_change_audit,
  remaining_access_exp,
} from "./change_password.js";

const CSRF_PATH = "/api/v2/auth/csrf";
const LOGIN_PATH = "/api/v2/auth/login";
const REFRESH_PATH = "/api/v2/auth/refresh";
const LOGOUT_PATH = "/api/v2/auth/logout";
const ME_PATH = "/api/v2/auth/me";
const CHANGE_PASSWORD_PATH = "/api/v2/auth/change-password";
const HEALTH_PATH = "/health";
const MAX_BODY_BYTES = 8192;

export async function handle_request(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  // Dummy base to parse a relative request.url; not a published origin.
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (request.method === "GET" && path === HEALTH_PATH) {
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "GET" && path === CSRF_PATH) {
    handle_csrf(response, config);
    return;
  }
  if (request.method === "POST" && path === LOGIN_PATH) {
    await handle_login(request, response, config);
    return;
  }
  if (path === REFRESH_PATH && request.method !== "POST") {
    json(response, 405, { detail: "Method not allowed" });
    return;
  }
  if (request.method === "POST" && path === REFRESH_PATH) {
    await handle_refresh(request, response, config);
    return;
  }
  if (path === LOGOUT_PATH && request.method !== "POST") {
    json(response, 405, { detail: "Method not allowed" });
    return;
  }
  if (request.method === "POST" && path === LOGOUT_PATH) {
    await handle_logout(request, response, config);
    return;
  }
  if (request.method === "GET" && path === ME_PATH) {
    await handle_me(request, response, config);
    return;
  }
  if (request.method === "POST" && path === CHANGE_PASSWORD_PATH) {
    await handle_change_password(request, response, config);
    return;
  }
  json(response, 404, { detail: "Not found" });
}

function handle_csrf(response: ServerResponse, config: AuthConfig): void {
  const token = random_token();
  response.setHeader("Set-Cookie", csrf_cookie(token, config.cookie_secure));
  json(response, 200, { csrf_token: token });
}

async function refuse_csrf_origin(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
  args: {
    reason: typeof CSRF_DENIED_ORIGIN | typeof CSRF_DENIED_CSRF;
    context_path: string;
    username?: string;
  },
): Promise<void> {
  const identity = request_identity(request, config.public_origin);
  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const csrf_cookie_value = cookies.get(CSRF_COOKIE_NAME) ?? "";
  const csrf_header = header_value(request.headers["x-csrf-token"]) ?? "";
  const origin = header_value(request.headers.origin) ?? "";
  const user_agent = header_value(request.headers["user-agent"]) ?? "";
  const data: Record<string, unknown> = {
    method: request.method ?? "",
    context_path: args.context_path,
    protocol: identity.protocol ?? null,
    host: identity.host ?? null,
    origin: bound_event_text(origin),
    user_agent: bound_event_text(user_agent),
    csrf_header_length: csrf_header.length,
    csrf_cookie_length: csrf_cookie_value.length,
  };
  if (args.username != null && args.username !== "") {
    data.username_provided = bound_event_text(args.username);
  }
  try {
    await config.audit.emit(
      csrf_denied_audit_event({
        reason: args.reason,
        ip_address: identity.source_ip,
        data,
      }),
    );
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }
  json(response, 403, { detail: "Forbidden" });
}

async function handle_login(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  let body: string;
  try {
    body = await read_body(request);
  } catch {
    json(response, 413, { detail: "Forbidden" });
    return;
  }

  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_ORIGIN,
      context_path: LOGIN_PATH,
    });
    return;
  }

  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const cookie_token = cookies.get(CSRF_COOKIE_NAME) ?? "";
  const parsed_body = parse_login_body(request, body);
  if (!parsed_body.ok) {
    json(response, 400, { detail: "Bad request" });
    return;
  }
  const submitted = submitted_csrf_token(request, parsed_body.data);
  if (
    cookie_token === "" ||
    submitted === "" ||
    !tokens_equal(cookie_token, submitted)
  ) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_CSRF,
      context_path: LOGIN_PATH,
      username: parsed_body.data.username,
    });
    return;
  }

  let settings;
  try {
    settings = await config.get_settings();
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }

  const identity = request_identity(request, config.public_origin);
  const result = await run_login_pipeline(
    {
      provided_username: parsed_body.data.username ?? "",
      password: parsed_body.data.password ?? "",
      source_ip: identity.source_ip,
      protocol: identity.protocol,
      host: identity.host,
      context_path: LOGIN_PATH,
      user_agent: header_value(request.headers["user-agent"]),
    },
    {
      settings,
      hash_slots: config.hash_slots,
      rate_limit: config.rate_limit,
      expiry: config.expiry,
      users: config.users,
      verify_password: config.verify_password,
      dummy_hash: config.dummy_hash,
      audit: config.audit,
      draw_t: config.draw_t,
      now_ms: config.now_ms,
      sleep: config.sleep,
    },
  );

  if (result.kind === "capacity") {
    json(response, 503, { detail: SERVICE_UNAVAILABLE });
    return;
  }
  if (result.kind === "internal_error") {
    json(response, 500, { detail: "Internal error" });
    return;
  }
  if (result.kind === "denied") {
    json(response, 401, { detail: ACCESS_DENIED });
    return;
  }

  const now = new Date();
  const times = login_session_times({
    now,
    access_ttl_seconds: settings.session_access_ttl_seconds,
    refresh_ttl_seconds: settings.session_refresh_ttl_seconds,
    total_ttl_seconds: settings.session_total_ttl_seconds,
    must_change: result.password_change_required,
  });
  const sid = new_uuid7(now.getTime());
  const user_agent = header_value(request.headers["user-agent"]);
  let refresh_token: string | null = null;
  let refresh_hmac: string | null = null;
  if (times.refresh_max_age != null) {
    refresh_token = mint_refresh_token();
    refresh_hmac = hmac_refresh_token(config.refresh_hmac_secret, refresh_token);
  }
  let token: string;
  try {
    await config.sessions.create({
      id: sid,
      user_id: result.user_id,
      refresh_hmac,
      session_expires_at: times.session_expires_at,
      refresh_expires_at: times.refresh_expires_at,
      ip_address: identity.source_ip ?? null,
      user_agent: user_agent == null || user_agent === "" ? null : user_agent,
    });
    token = await sign_access_token(config.private_key, result.user_id, {
      ttl_seconds: times.jwt_ttl_seconds,
      now,
      sid,
      password_change_required: result.password_change_required,
    });
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }
  const set_cookies = [
    csrf_cookie(cookie_token, config.cookie_secure),
    access_cookie(token, config.cookie_secure, times.access_max_age),
  ];
  if (refresh_token != null && times.refresh_max_age != null) {
    set_cookies.push(
      refresh_cookie(refresh_token, config.cookie_secure, times.refresh_max_age),
    );
  }
  response.setHeader("Set-Cookie", set_cookies);

  const wants_json = (header_value(request.headers.accept) ?? "").includes(
    "application/json",
  );
  if (!wants_json) {
    redirect(response, safe_next_path(parsed_body.data.next, "/"));
    return;
  }
  json(response, 200, { ok: true });
}

const refresh_body_schema = z.object({
  csrf_token: z.string().min(1).optional(),
  refresh_token: z.string().optional(),
});

async function handle_refresh(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  let body: string;
  try {
    body = await read_body(request);
  } catch {
    json(response, 413, { detail: "Payload too large" });
    return;
  }

  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_ORIGIN,
      context_path: REFRESH_PATH,
    });
    return;
  }

  const parsed_body = parse_refresh_body(request, body);
  if (!parsed_body.ok) {
    json(response, 400, { detail: "Bad request" });
    return;
  }
  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const csrf_cookie_value = cookies.get(CSRF_COOKIE_NAME) ?? "";
  const submitted = submitted_csrf_token(request, parsed_body.data);
  if (
    csrf_cookie_value === "" ||
    submitted === "" ||
    !tokens_equal(csrf_cookie_value, submitted)
  ) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_CSRF,
      context_path: REFRESH_PATH,
    });
    return;
  }

  let settings;
  try {
    settings = await config.get_settings();
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }

  const identity = request_identity(request, config.public_origin);
  const access_token = cookies.get(ACCESS_COOKIE_NAME) ?? "";
  const refresh_token = cookies.get(REFRESH_COOKIE_NAME) ?? "";
  const result = await run_refresh_pipeline(
    {
      access_token: access_token === "" ? null : access_token,
      refresh_token: refresh_token === "" ? null : refresh_token,
      source_ip: identity.source_ip,
      protocol: identity.protocol,
      host: identity.host,
      context_path: REFRESH_PATH,
      user_agent: header_value(request.headers["user-agent"]),
    },
    {
      settings,
      public_key: config.public_key,
      private_key: config.private_key,
      refresh_hmac_secret: config.refresh_hmac_secret,
      sessions: config.sessions,
      audit: config.audit,
      draw_t: config.draw_t,
      now_ms: config.now_ms,
      sleep: config.sleep,
    },
  );

  if (result.kind === "internal_error") {
    json(response, 500, { detail: "Internal error" });
    return;
  }
  if (result.kind === "unavailable") {
    json(response, 503, { detail: SERVICE_UNAVAILABLE });
    return;
  }
  if (result.kind === "soft") {
    json(response, 401, { detail: ACCESS_DENIED, retry: REFRESH_RETRY });
    return;
  }
  if (result.kind === "hard") {
    json(response, 401, { detail: ACCESS_DENIED });
    return;
  }

  const set_cookies = [
    csrf_cookie(csrf_cookie_value, config.cookie_secure),
    refresh_cookie(result.refresh_token, config.cookie_secure, result.refresh_max_age),
  ];
  if (result.access_token != null) {
    set_cookies.push(
      access_cookie(result.access_token, config.cookie_secure, result.access_max_age),
    );
  }
  response.setHeader("Set-Cookie", set_cookies);
  json(response, 200, { ok: true });
}

const logout_body_schema = z.object({
  csrf_token: z.string().min(1).optional(),
  refresh_token: z.string().optional(),
});

async function handle_logout(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  let body: string;
  try {
    body = await read_body(request);
  } catch {
    json(response, 413, { detail: "Payload too large" });
    return;
  }

  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_ORIGIN,
      context_path: LOGOUT_PATH,
    });
    return;
  }

  const parsed_body = parse_logout_body(request, body);
  if (!parsed_body.ok) {
    json(response, 400, { detail: "Bad request" });
    return;
  }
  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const csrf_cookie_value = cookies.get(CSRF_COOKIE_NAME) ?? "";
  const submitted = submitted_csrf_token(request, parsed_body.data);
  if (
    csrf_cookie_value === "" ||
    submitted === "" ||
    !tokens_equal(csrf_cookie_value, submitted)
  ) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_CSRF,
      context_path: LOGOUT_PATH,
    });
    return;
  }

  const identity = request_identity(request, config.public_origin);
  const result = await run_logout_pipeline(
    {
      access_token: access_token_from_request(request),
      source_ip: identity.source_ip,
      protocol: identity.protocol,
      host: identity.host,
      context_path: LOGOUT_PATH,
      user_agent: header_value(request.headers["user-agent"]),
    },
    {
      public_key: config.public_key,
      sessions: config.sessions,
      audit: config.audit,
    },
  );

  if (result.kind === "internal_error") {
    json(response, 500, { detail: "Internal error" });
    return;
  }
  if (result.kind === "denied") {
    json(response, 401, { detail: ACCESS_DENIED });
    return;
  }

  response.setHeader("Set-Cookie", [
    expire_access_cookie(config.cookie_secure),
    expire_refresh_cookie(config.cookie_secure),
  ]);
  json(response, 200, { ok: true });
}

function parse_logout_body(
  request: IncomingMessage,
  body: string,
): { ok: true; data: { csrf_token?: string } } | { ok: false } {
  const content_type = header_value(request.headers["content-type"]) ?? "";
  if (content_type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      const result = logout_body_schema.safeParse(parsed);
      return { ok: true, data: result.success ? result.data : {} };
    } catch {
      return { ok: false };
    }
  }
  if (content_type.includes("application/x-www-form-urlencoded")) {
    const result = logout_body_schema.safeParse(
      Object.fromEntries(new URLSearchParams(body)),
    );
    return { ok: true, data: result.success ? result.data : {} };
  }
  return { ok: true, data: {} };
}

function parse_refresh_body(
  request: IncomingMessage,
  body: string,
): { ok: true; data: { csrf_token?: string } } | { ok: false } {
  const content_type = header_value(request.headers["content-type"]) ?? "";
  if (content_type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      const result = refresh_body_schema.safeParse(parsed);
      return { ok: true, data: result.success ? result.data : {} };
    } catch {
      return { ok: false };
    }
  }
  if (content_type.includes("application/x-www-form-urlencoded")) {
    const result = refresh_body_schema.safeParse(
      Object.fromEntries(new URLSearchParams(body)),
    );
    return { ok: true, data: result.success ? result.data : {} };
  }
  return { ok: true, data: {} };
}

function access_token_from_request(request: IncomingMessage): string | null {
  const authorization = header_value(request.headers.authorization) ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    return token === "" ? null : token;
  }
  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const cookie_token = cookies.get(ACCESS_COOKIE_NAME) ?? "";
  return cookie_token === "" ? null : cookie_token;
}

async function handle_me(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  const token = access_token_from_request(request);
  if (token == null) {
    credentials_denied(response, false);
    return;
  }
  const verified = await verify_access_jwt(config.public_key, token);
  if (verified.kind === "invalid") {
    credentials_denied(response, false);
    return;
  }
  if (verified.kind === "expired") {
    credentials_denied(response, true);
    return;
  }
  const sub = verified.payload.sub as string;
  const user = await config.users.load_by_id(sub);
  if (user == null || !user.is_active) {
    credentials_denied(response, false);
    return;
  }
  const rbac = await config.users.roles_and_permissions(user.id);
  json(response, 200, {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_active: user.is_active,
    roles: rbac.roles,
    permissions: rbac.permissions,
  });
}

const change_password_schema = z.object({
  csrf_token: z.string().min(1).optional(),
  current_password: z.string().optional(),
  new_password: z.string().optional(),
  verify_new_password: z.string().optional(),
  invalidate_user_sessions: z.union([z.boolean(), z.string()]).optional(),
});

function parse_invalidate_user_sessions(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

async function handle_change_password(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  let body: string;
  try {
    body = await read_body(request);
  } catch {
    json(response, 413, { detail: "Payload too large" });
    return;
  }

  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_ORIGIN,
      context_path: CHANGE_PASSWORD_PATH,
    });
    return;
  }

  const content_type = header_value(request.headers["content-type"]) ?? "";
  let parsed: z.infer<typeof change_password_schema> = {};
  if (content_type.includes("application/json")) {
    try {
      const raw: unknown = JSON.parse(body);
      const result = change_password_schema.safeParse(raw);
      parsed = result.success ? result.data : {};
    } catch {
      json(response, 400, { detail: "Malformed JSON" });
      return;
    }
  } else if (content_type.includes("application/x-www-form-urlencoded")) {
    const result = change_password_schema.safeParse(
      Object.fromEntries(new URLSearchParams(body)),
    );
    parsed = result.success ? result.data : {};
  }

  const cookies = parse_cookie_header(header_value(request.headers.cookie));
  const csrf_cookie_value = cookies.get(CSRF_COOKIE_NAME) ?? "";
  const submitted = header_value(request.headers["x-csrf-token"]) || parsed.csrf_token || "";
  if (
    csrf_cookie_value === "" ||
    submitted === "" ||
    !tokens_equal(csrf_cookie_value, submitted)
  ) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_CSRF,
      context_path: CHANGE_PASSWORD_PATH,
    });
    return;
  }

  const access = access_token_from_request(request);
  if (access == null) {
    credentials_denied(response, false);
    return;
  }
  const verified = await verify_access_jwt(config.public_key, access);
  if (verified.kind === "invalid") {
    credentials_denied(response, false);
    return;
  }
  if (verified.kind === "expired") {
    credentials_denied(response, true);
    return;
  }
  const payload = verified.payload;
  const user_id = payload.sub as string;
  if (typeof user_id !== "string" || user_id === "") {
    credentials_denied(response, false);
    return;
  }

  const identity = request_identity(request, config.public_origin);
  let settings;
  try {
    settings = await config.get_settings();
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }

  const invalidate_user_sessions = parse_invalidate_user_sessions(
    parsed.invalidate_user_sessions,
  );
  const user_agent_header = header_value(request.headers["user-agent"]);
  let outcome;
  try {
    outcome = await execute_change_password(config.change_password_apply, {
      user_id,
      session_id: session_id_claim(payload),
      input: {
        current_password: parsed.current_password ?? "",
        new_password: parsed.new_password ?? "",
        verify_new_password: parsed.verify_new_password ?? "",
      },
      invalidate_user_sessions,
      settings,
      verify_password: config.verify_password,
      refresh_hmac_secret: config.refresh_hmac_secret,
      ip_address: identity.source_ip ?? null,
      user_agent:
        user_agent_header == null || user_agent_header === ""
          ? null
          : user_agent_header,
    });
  } catch {
    json(response, 500, { detail: "Internal error" });
    return;
  }

  if (outcome.kind === "missing_user") {
    json(response, 401, { detail: "Could not validate credentials" });
    return;
  }
  if (outcome.kind === "locked") {
    await password_change_audit(config.audit, {
      success: false,
      user_id,
      ip_address: identity.source_ip,
      reason: "password_change_locked",
      data: { username: outcome.username },
    });
    json(response, 401, { detail: ACCESS_DENIED });
    return;
  }
  if (outcome.kind === "failed") {
    await password_change_audit(config.audit, {
      success: false,
      user_id,
      ip_address: identity.source_ip,
      reason: "password_change_failed",
      data: { username: outcome.username },
    });
    json(response, 422, { detail: PASSWORD_CHANGE_FAILED });
    return;
  }

  if (outcome.effect.kind === "logged_out") {
    response.setHeader("Set-Cookie", [
      expire_access_cookie(config.cookie_secure),
      expire_refresh_cookie(config.cookie_secure),
    ]);
    await password_change_audit(config.audit, {
      success: true,
      user_id,
      ip_address: identity.source_ip,
      reason: "password_change_ok",
      data: {
        username: outcome.username,
        invalidate_user_sessions: true,
      },
    });
    json(response, 200, { ok: true, detail: PASSWORD_CHANGE_OK });
    return;
  }

  if (outcome.effect.kind === "first_refresh") {
    const exp = remaining_access_exp(payload);
    let token: string;
    try {
      token = await sign_access_token(config.private_key, user_id, {
        exp,
        sid: session_id_claim(payload),
      });
    } catch {
      json(response, 500, { detail: "Internal error" });
      return;
    }
    response.setHeader("Set-Cookie", [
      access_cookie(
        token,
        config.cookie_secure,
        outcome.effect.refresh_max_age,
      ),
      refresh_cookie(
        outcome.effect.refresh_token,
        config.cookie_secure,
        outcome.effect.refresh_max_age,
      ),
    ]);
  }

  await password_change_audit(config.audit, {
    success: true,
    user_id,
    ip_address: identity.source_ip,
    reason: "password_change_ok",
    data: { username: outcome.username },
  });
  json(response, 200, { ok: true, detail: PASSWORD_CHANGE_OK });
}

const login_form_schema = z.object({
  csrf_token: z.string().min(1).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  next: z.string().optional(),
});

type LoginBody = z.infer<typeof login_form_schema>;

function parse_login_body(
  request: IncomingMessage,
  body: string,
): { ok: true; data: LoginBody } | { ok: false } {
  const content_type = header_value(request.headers["content-type"]) ?? "";
  if (content_type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      const result = login_form_schema.safeParse(parsed);
      return { ok: true, data: result.success ? result.data : {} };
    } catch {
      return { ok: false };
    }
  }
  if (content_type.includes("application/x-www-form-urlencoded")) {
    const result = login_form_schema.safeParse(
      Object.fromEntries(new URLSearchParams(body)),
    );
    return { ok: true, data: result.success ? result.data : {} };
  }
  return { ok: true, data: {} };
}

function submitted_csrf_token(
  request: IncomingMessage,
  parsed: { csrf_token?: string },
): string {
  const header_token = header_value(request.headers["x-csrf-token"]);
  if (header_token != null && header_token !== "") {
    return header_token;
  }
  return parsed.csrf_token ?? "";
}

function credentials_denied(response: ServerResponse, retry: boolean): void {
  if (retry) {
    json(response, 401, { detail: "Could not validate credentials", retry: REFRESH_RETRY });
    return;
  }
  json(response, 401, { detail: "Could not validate credentials" });
}

function json(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Content-Length", String(body.length));
  response.end(body);
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.end();
}

function header_value(value: string | string[] | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

async function read_body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("body too large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export const AUTH_SESSION_PATHS = {
  csrf: CSRF_PATH,
  login: LOGIN_PATH,
  refresh: REFRESH_PATH,
  logout: LOGOUT_PATH,
  me: ME_PATH,
  change_password: CHANGE_PASSWORD_PATH,
  access_cookie: ACCESS_COOKIE_NAME,
  csrf_cookie: CSRF_COOKIE_NAME,
} as const;
