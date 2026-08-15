export const CSRF_COOKIE_NAME = "__untangled_csrf";
export const ACCESS_COOKIE_NAME = "__untangled_access";

export type CookieAttrs = {
  http_only: boolean;
  secure: boolean;
  same_site: "Lax";
  path: "/";
  max_age?: number;
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
  if (attrs.max_age != null) {
    parts.push(`Max-Age=${attrs.max_age}`);
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

export function access_cookie(
  value: string,
  secure: boolean,
  max_age: number,
): string {
  return serialize_cookie(ACCESS_COOKIE_NAME, value, {
    http_only: true,
    secure,
    same_site: "Lax",
    path: "/",
    max_age,
  });
}

export function expire_access_cookie(secure: boolean): string {
  return serialize_cookie(ACCESS_COOKIE_NAME, "", {
    http_only: true,
    secure,
    same_site: "Lax",
    path: "/",
    max_age: 0,
  });
}
