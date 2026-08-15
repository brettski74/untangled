import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";

export function copy_headers(
  headers: IncomingHttpHeaders,
  drop_content_length?: boolean,
): IncomingHttpHeaders;
export function is_auth_path(url_path: string): boolean;
export function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
): void;
export function create_edge_server(web: URL, auth: URL): Server;
