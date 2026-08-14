import http from "node:http";
import { pathToFileURL } from "node:url";

import { load_config_from_env } from "./config.js";
import { handle_request } from "./http.js";

export function create_server(
  config = load_config_from_env(),
): http.Server {
  return http.createServer((request, response) => {
    void handle_request(request, response, config).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ detail: "Internal error" }));
      } else {
        response.end();
      }
    });
  });
}

function listen_port(): number {
  const raw = process.env.PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer 1–65535; got ${JSON.stringify(raw)}`);
  }
  return port;
}

const is_main =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (is_main) {
  const port = listen_port();
  create_server().listen(port, "0.0.0.0", () => {
    process.stdout.write(`untangled-auth listening on ${port}\n`);
  });
}
