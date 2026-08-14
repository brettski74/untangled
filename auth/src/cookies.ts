export const CSRF_COOKIE_NAME = "__untangled_csrf";
export const SKELETON_COOKIE_NAME = "__untangled_auth_skeleton";

export type CookieAttrs = {
  http_only: boolean;
  secure: boolean;
  same_site: "Lax";
  path: "/";
};

export function parse_cookie_header(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (header == null || header === "") {
    return out;
  }
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut <= 0) {
      continue;
    }
    const name = part.slice(0, cut).trim();
    const value = part.slice(cut + 1).trim();
    if (name !== "") {
      out.set(name, value);
    }
  }
  return out;
}

export function serialize_cookie(
  name: string,
  value: string,
  attrs: CookieAttrs,
): string {
  const parts = [`${name}=${value}`, `Path=${attrs.path}`, `SameSite=${attrs.same_site}`];
  if (attrs.http_only) {
    parts.push("HttpOnly");
  }
  if (attrs.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function csrf_cookie(value: string, secure: boolean): string {
  return serialize_cookie(CSRF_COOKIE_NAME, value, {
    http_only: false,
    secure,
    same_site: "Lax",
    path: "/",
  });
}

export function skeleton_cookie(value: string, secure: boolean): string {
  return serialize_cookie(SKELETON_COOKIE_NAME, value, {
    http_only: true,
    secure,
    same_site: "Lax",
    path: "/",
  });
}
