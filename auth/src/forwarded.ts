import type { IncomingMessage } from "node:http";

/** Client IP Caddy asserted via overwritten Forwarded, else the socket peer. */
export function client_ip(request: IncomingMessage): string | undefined {
  const forwarded = header_value(request.headers.forwarded);
  const from_forwarded = parse_forwarded_for(forwarded);
  if (from_forwarded != null) {
    return from_forwarded;
  }
  return request.socket.remoteAddress ?? undefined;
}

export function parse_forwarded_for(header: string | undefined): string | undefined {
  if (header == null || header === "") {
    return undefined;
  }
  const first = header.split(",")[0]?.trim() ?? "";
  const match = /(?:^|;)\s*for=([^;]+)/i.exec(first);
  if (match == null || match[1] == null) {
    return undefined;
  }
  return normalize_forwarded_node(match[1].trim());
}

function normalize_forwarded_node(raw: string): string | undefined {
  let value = raw;
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }
  if (value === "") {
    return undefined;
  }
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 1) {
      return value.slice(1, end);
    }
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    return value.slice(0, value.lastIndexOf(":"));
  }
  return value;
}

function header_value(value: string | string[] | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}
