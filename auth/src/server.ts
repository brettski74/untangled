import http from "node:http";

import type { AuthConfig } from "./config.js";
import { handle_request } from "./http.js";

export function create_server(config: AuthConfig): http.Server {
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
