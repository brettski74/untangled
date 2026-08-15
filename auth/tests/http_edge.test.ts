import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { copy_headers, create_edge_server } from "../scripts/http_edge.mjs";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function collect_body(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

describe("copy_headers", () => {
  it("drops hop-by-hop names and Connection tokens, keeps origin and cookies", () => {
    const out = copy_headers(
      {
        connection: "keep-alive, x-foo",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        "x-foo": "nope",
        origin: "http://127.0.0.1:5173",
        cookie: "__untangled_access=abc",
        "x-csrf-token": "tok",
        "content-type": "application/json",
        "content-length": "12",
      },
      true,
    ) as Record<string, string | undefined>;
    assert.equal(out.connection, undefined);
    assert.equal(out["keep-alive"], undefined);
    assert.equal(out["transfer-encoding"], undefined);
    assert.equal(out["x-foo"], undefined);
    assert.equal(out["content-length"], undefined);
    assert.equal(out.origin, "http://127.0.0.1:5173");
    assert.equal(out.cookie, "__untangled_access=abc");
    assert.equal(out["x-csrf-token"], "tok");
    assert.equal(out["content-type"], "application/json");
  });
});

describe("http_edge proxy", () => {
  let web: http.Server;
  let auth: http.Server;
  let edge: http.Server;
  let edge_port = 0;
  let web_port = 0;
  let last_web: {
    method?: string;
    path?: string;
    body?: string;
    host?: string;
    origin?: string;
  } = {};
  let last_auth: { method?: string; path?: string } = {};

  before(async () => {
    web = http.createServer(async (req, res) => {
      const body = await collect_body(req);
      last_web = {
        method: req.method,
        path: req.url,
        body: body.toString("utf8"),
        host: req.headers.host,
        origin: req.headers.origin,
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          method: req.method,
          path: req.url,
          body: last_web.body,
        }),
      );
    });
    auth = http.createServer(async (req, res) => {
      await collect_body(req);
      last_auth = { method: req.method, path: req.url };
      res.setHeader("set-cookie", [
        "__untangled_csrf=tok; Path=/; SameSite=Lax",
        "__untangled_access=jwt; Path=/; HttpOnly; SameSite=Lax",
      ]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    web_port = await listen(web);
    const auth_port = await listen(auth);
    edge = create_edge_server(
      new URL(`http://127.0.0.1:${web_port}`),
      new URL(`http://127.0.0.1:${auth_port}`),
    );
    edge_port = await listen(edge);
  });

  after(async () => {
    await close(edge);
    await close(web);
    await close(auth);
  });

  function edge_url(path: string): string {
    return `http://127.0.0.1:${edge_port}${path}`;
  }

  it("GET / goes to web", async () => {
    const response = await fetch(edge_url("/"));
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    assert.equal(last_web.method, "GET");
    assert.equal(last_web.path, "/");
    assert.deepEqual(body, { method: "GET", path: "/", body: "" });
  });

  it("POST JSON with Connection and chunked TE completes to web", async () => {
    const payload = JSON.stringify({ hello: "edge" });
    const body = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("POST hung")), 2000);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: edge_port,
          path: "/",
          method: "POST",
          headers: {
            "content-type": "application/json",
            connection: "keep-alive",
            "transfer-encoding": "chunked",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          );
          res.on("end", () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
        },
      );
      req.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      req.write(payload);
      req.end();
    });
    assert.equal(last_web.method, "POST");
    assert.equal(last_web.body, payload);
    assert.deepEqual(JSON.parse(body), {
      method: "POST",
      path: "/",
      body: payload,
    });
  });

  it("forwards public Host and Origin, not the upstream listen address", async () => {
    const origin = `http://127.0.0.1:${edge_port}`;
    const response = await fetch(edge_url("/incident/x.data"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(last_web.host, `127.0.0.1:${edge_port}`);
    assert.notEqual(last_web.host, `127.0.0.1:${web_port}`);
    assert.equal(last_web.origin, origin);
  });

  it("PATCH JSON goes to web with body", async () => {
    const payload = JSON.stringify({ summary: "patched" });
    const response = await fetch(edge_url("/incident/x"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    assert.equal(response.status, 200);
    assert.equal(last_web.method, "PATCH");
    assert.equal(last_web.path, "/incident/x");
    assert.equal(last_web.body, payload);
  });

  it("POST /api/v2/auth/login goes to auth and forwards Set-Cookie", async () => {
    const response = await fetch(edge_url("/api/v2/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(last_auth.method, "POST");
    assert.equal(last_auth.path, "/api/v2/auth/login");
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0] ?? "", /__untangled_csrf=/);
    assert.match(cookies[1] ?? "", /__untangled_access=/);
  });
});
