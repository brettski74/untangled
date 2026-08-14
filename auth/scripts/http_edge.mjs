#!/usr/bin/env node
/**
 * Host-dev / CI HTTP edge: same-origin /api/v2/auth → auth, everything else → web.
 * Not a production perimeter proxy.
 */
import http from "node:http";

function origin_url(raw, fallback) {
  return new URL(raw === "" ? fallback : raw);
}

const listen_raw = process.env.PORT ?? "5173";
const listen = Number(listen_raw);
if (!Number.isInteger(listen) || listen < 1 || listen > 65535) {
  throw new Error(`PORT must be an integer 1–65535; got ${JSON.stringify(listen_raw)}`);
}

const web = origin_url(process.env.UNTANGLED_WEB_ORIGIN ?? "", "http://127.0.0.1:3000");
const auth = origin_url(process.env.UNTANGLED_AUTH_ORIGIN ?? "", "http://127.0.0.1:3001");

function is_auth_path(url_path) {
  return url_path === "/api/v2/auth" || url_path.startsWith("/api/v2/auth/");
}

function proxy(req, res, target) {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  const dest = new URL(incoming.pathname + incoming.search, target);
  const headers = { ...req.headers, host: dest.host };
  const upstream = http.request(
    dest,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
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

http
  .createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    proxy(req, res, is_auth_path(path) ? auth : web);
  })
  .listen(listen, "127.0.0.1", () => {
    process.stdout.write(
      `untangled-http-edge listening on ${listen} (web ${web.origin}, auth ${auth.origin})\n`,
    );
  });
