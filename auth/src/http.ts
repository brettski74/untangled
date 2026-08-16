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
} from "./cookies.js";
import { random_token, tokens_equal } from "./csrf.js";
import { request_identity } from "./forwarded.js";
import { sign_access_token } from "./jwt.js";
import { ACCESS_DENIED, SERVICE_UNAVAILABLE } from "./login_settings.js";
import { run_login_pipeline } from "./login_pipeline.js";
import { safe_next_path } from "./next_path.js";
import { origin_is_exact_match } from "./origin.js";

const CSRF_PATH = "/api/v2/auth/csrf";
const LOGIN_PATH = "/api/v2/auth/login";
const HEALTH_PATH = "/health";
const MAX_BODY_BYTES = 8192;

export async function handle_request(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
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
  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    await refuse_csrf_origin(request, response, config, {
      reason: CSRF_DENIED_ORIGIN,
      context_path: LOGIN_PATH,
    });
    return;
  }

  let body: string;
  try {
    body = await read_body(request);
  } catch {
    json(response, 413, { detail: "Forbidden" });
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

  const token = await sign_access_token(
    config.private_key,
    result.user_id,
    config.access_token_ttl_seconds,
  );
  const set_cookies = [
    csrf_cookie(cookie_token, config.cookie_secure),
    access_cookie(token, config.cookie_secure, config.access_token_ttl_seconds),
  ];
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
  access_cookie: ACCESS_COOKIE_NAME,
  csrf_cookie: CSRF_COOKIE_NAME,
} as const;
