import type { IncomingMessage } from "node:http";

export type ForwardedIdentity = {
  for?: string;
  proto?: string;
  host?: string;
};

function header_value(value: string | string[] | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function param(segment: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|;)\\s*${name}=([^;]+)`, "i").exec(segment);
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

export function parse_forwarded(header: string | undefined): ForwardedIdentity {
  if (header == null || header === "") {
    return {};
  }
  const first = header.split(",")[0]?.trim() ?? "";
  return {
    for: param(first, "for"),
    proto: param(first, "proto"),
    host: param(first, "host"),
  };
}

/** Client IP Caddy asserted via overwritten Forwarded, else the socket peer. */
export function parse_forwarded_for(header: string | undefined): string | undefined {
  return parse_forwarded(header).for;
}

export function client_ip(request: IncomingMessage): string | undefined {
  return request_identity(request, undefined).source_ip;
}

export function request_identity(
  request: IncomingMessage,
  public_origin: string | undefined,
): {
  source_ip: string | undefined;
  protocol: string | undefined;
  host: string | undefined;
} {
  const forwarded = parse_forwarded(header_value(request.headers.forwarded));
  let protocol = forwarded.proto;
  let host = forwarded.host;
  if ((protocol == null || host == null) && public_origin != null && public_origin !== "") {
    try {
      const origin = new URL(public_origin);
      protocol = protocol ?? origin.protocol.replace(":", "");
      host = host ?? origin.host;
    } catch {
      // public_origin is validated at config load
    }
  }
  return {
    source_ip: forwarded.for ?? request.socket.remoteAddress ?? undefined,
    protocol,
    host,
  };
}
