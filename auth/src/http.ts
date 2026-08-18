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
  access_cookie,
  csrf_cookie,
  parse_cookie_header,
  refresh_cookie,
} from "./cookies.js";
import { random_token, tokens_equal } from "./csrf.js";
import { request_identity } from "./forwarded.js";
import {
  session_id_claim,
  sign_access_token,
  verify_access_token,
} from "./jwt.js";
import { hmac_refresh_token, mint_refresh_token } from "./refresh_hmac.js";
import { ACCESS_DENIED, SERVICE_UNAVAILABLE } from "./login_settings.js";
import { run_login_pipeline } from "./login_pipeline.js";
import { login_session_times } from "./session_issue.js";
import { new_uuid7 } from "./uuidv7.js";
import { safe_next_path } from "./next_path.js";
import { origin_is_exact_match } from "./origin.js";
import {
  PASSWORD_CHANGE_FAILED,
  PASSWORD_CHANGE_OK,
  password_change_audit,
  remaining_access_exp,
  run_change_password,
} from "./change_password.js";

const CSRF_PATH = "/api/v2/auth/csrf";
const LOGIN_PATH = "/api/v2/auth/login";
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
    json(response, 401, { detail: "Could not validate credentials" });
    return;
  }
  let sub: string;
  try {
    const payload = await verify_access_token(config.public_key, token);
    sub = payload.sub as string;
  } catch {
    json(response, 401, { detail: "Could not validate credentials" });
    return;
  }
  const user = await config.users.load_by_id(sub);
  if (user == null || !user.is_active) {
    json(response, 401, { detail: "Could not validate credentials" });
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
});

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
    json(response, 401, { detail: "Could not validate credentials" });
    return;
  }
  let payload;
  try {
    payload = await verify_access_token(config.public_key, access);
  } catch {
    json(response, 401, { detail: "Could not validate credentials" });
    return;
  }
  const user = await config.users.load_by_id(payload.sub as string);
  if (user == null) {
    json(response, 401, { detail: "Could not validate credentials" });
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

  const outcome = await run_change_password(
    user,
    {
      current_password: parsed.current_password ?? "",
      new_password: parsed.new_password ?? "",
      verify_new_password: parsed.verify_new_password ?? "",
    },
    settings,
    config.users,
    config.verify_password,
  );

  if (outcome.kind === "locked") {
    await password_change_audit(config.audit, {
      success: false,
      user_id: user.id,
      ip_address: identity.source_ip,
      reason: "password_change_locked",
      data: { username: user.username },
    });
    json(response, 401, { detail: ACCESS_DENIED });
    return;
  }
  if (outcome.kind === "failed") {
    await password_change_audit(config.audit, {
      success: false,
      user_id: user.id,
      ip_address: identity.source_ip,
      reason: "password_change_failed",
      data: { username: user.username },
    });
    json(response, 422, { detail: PASSWORD_CHANGE_FAILED });
    return;
  }

  const exp = remaining_access_exp(payload);
  const token = await sign_access_token(config.private_key, user.id, {
    exp,
    sid: session_id_claim(payload),
  });
  response.setHeader(
    "Set-Cookie",
    access_cookie(token, config.cookie_secure, Math.max(1, (exp ?? 1) - Math.floor(Date.now() / 1000))),
  );
  await password_change_audit(config.audit, {
    success: true,
    user_id: user.id,
    ip_address: identity.source_ip,
    reason: "password_change_ok",
    data: { username: user.username },
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

function submitted_csrf_token(request: IncomingMessage, parsed: LoginBody): string {
  const header_token = header_value(request.headers["x-csrf-token"]);
  if (header_token != null && header_token !== "") {
    return header_token;
  }
  return parsed.csrf_token ?? "";
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
  me: ME_PATH,
  change_password: CHANGE_PASSWORD_PATH,
  access_cookie: ACCESS_COOKIE_NAME,
  csrf_cookie: CSRF_COOKIE_NAME,
} as const;
