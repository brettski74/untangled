import { CSRF_COOKIE_NAME } from "./cookie_names";

/** Read `__untangled_csrf` from a `Cookie` / `document.cookie` header. Last match wins. */
export function csrf_token_from_cookie_header(header: string): string {
  let found = "";
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut <= 0) {
      continue;
    }
    const name = part.slice(0, cut).trim();
    if (name === CSRF_COOKIE_NAME) {
      found = part.slice(cut + 1).trim();
    }
  }
  return found;
}

export function csrf_token_from_document_cookie(): string {
  if (typeof document === "undefined") {
    return "";
  }
  return csrf_token_from_cookie_header(document.cookie);
}
