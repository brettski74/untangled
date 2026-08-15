import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { AuthConfig } from "./config.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  access_cookie,
  csrf_cookie,
  parse_cookie_header,
} from "./cookies.js";
import { random_token, tokens_equal } from "./csrf.js";
import { sign_access_token } from "./jwt.js";
import { safe_next_path } from "./next_path.js";
import { origin_is_exact_match } from "./origin.js";

const CSRF_PATH = "/api/v2/auth/csrf";
const LOGIN_PATH = "/api/v2/auth/login";
const HEALTH_PATH = "/health";
const MAX_BODY_BYTES = 8192;
const INVALID_CREDENTIALS = "Invalid username or password";

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

async function handle_login(
  request: IncomingMessage,
  response: ServerResponse,
  config: AuthConfig,
): Promise<void> {
  if (!origin_is_exact_match(header_value(request.headers.origin), config.public_origin)) {
    json(response, 403, { detail: "Forbidden" });
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
  const submitted = submitted_csrf_token(request, parsed_body);
  if (
    cookie_token === "" ||
    submitted === "" ||
    !tokens_equal(cookie_token, submitted)
  ) {
    json(response, 403, { detail: "Forbidden" });
    return;
  }

  const username = parsed_body.username ?? "";
  const password = parsed_body.password ?? "";
  const user = await config.authenticate(username, password);
  if (user == null) {
    json(response, 401, { detail: INVALID_CREDENTIALS });
    return;
  }

  const token = await sign_access_token(
    config.private_key,
    user.id,
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
    redirect(response, safe_next_path(parsed_body.next, "/"));
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

function parse_login_body(request: IncomingMessage, body: string): LoginBody {
  const content_type = header_value(request.headers["content-type"]) ?? "";
  if (content_type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      const result = login_form_schema.safeParse(parsed);
      return result.success ? result.data : {};
    } catch {
      return {};
    }
  }
  if (content_type.includes("application/x-www-form-urlencoded")) {
    const result = login_form_schema.safeParse(
      Object.fromEntries(new URLSearchParams(body)),
    );
    return result.success ? result.data : {};
  }
  return {};
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
