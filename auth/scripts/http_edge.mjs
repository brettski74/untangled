#!/usr/bin/env node
/**
 * Host-dev / CI HTTP edge: same-origin /api/v2/auth → auth, everything else → web.
 * Not a production perimeter proxy.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "http2-settings",
]);

function origin_url(raw, fallback) {
  return new URL(raw === "" ? fallback : raw);
}

function connection_tokens(headers) {
  const extra = new Set();
  const raw = headers.connection;
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  if (typeof text !== "string" || text === "") {
    return extra;
  }
  for (const token of text.split(",")) {
    const name = token.trim().toLowerCase();
    if (name !== "") {
      extra.add(name);
    }
  }
  return extra;
}

export function copy_headers(headers, drop_content_length = false) {
  const extra_hop = connection_tokens(headers);
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value == null) {
      continue;
    }
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key) || extra_hop.has(key)) {
      continue;
    }
    if (drop_content_length && key === "content-length") {
      continue;
    }
    out[name] = value;
  }
  return out;
}

export function is_auth_path(url_path) {
  return url_path === "/api/v2/auth" || url_path.startsWith("/api/v2/auth/");
}

export function proxy(req, res, target) {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  const dest = new URL(incoming.pathname + incoming.search, target);
  const headers = copy_headers(req.headers, true);
  const incoming_host = req.headers.host;
  if (typeof incoming_host !== "string" || incoming_host === "") {
    headers.host = dest.host;
  }
  const upstream = http.request(
    dest,
    { method: req.method, headers },
    (up) => {
      const out_headers = copy_headers(up.headers, false);
      const cookies = up.headersDistinct?.["set-cookie"];
      if (cookies != null && cookies.length > 0) {
        out_headers["set-cookie"] = cookies;
      }
      res.writeHead(up.statusCode ?? 502, out_headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Bad gateway");
    } else {
      res.end();
    }
  });
  req.pipe(upstream);
}

export function create_edge_server(web, auth) {
  return http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    proxy(req, res, is_auth_path(path) ? auth : web);
  });
}

function invoked_as_cli() {
  const entry = process.argv[1];
  if (entry == null) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (invoked_as_cli()) {
  const listen_raw = process.env.PORT ?? "5173";
  const listen = Number(listen_raw);
  if (!Number.isInteger(listen) || listen < 1 || listen > 65535) {
    throw new Error(
      `PORT must be an integer 1–65535; got ${JSON.stringify(listen_raw)}`,
    );
  }
  const web = origin_url(process.env.UNTANGLED_WEB_ORIGIN ?? "", "http://127.0.0.1:3000");
  const auth = origin_url(
    process.env.UNTANGLED_AUTH_ORIGIN ?? "",
    "http://127.0.0.1:3001",
  );
  create_edge_server(web, auth).listen(listen, "127.0.0.1", () => {
    process.stdout.write(
      `untangled-http-edge listening on ${listen} (web ${web.origin}, auth ${auth.origin})\n`,
    );
  });
}
