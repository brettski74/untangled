import { describe, expect, it } from "vitest";

import { CSRF_COOKIE_NAME } from "./cookie_names";
import { csrf_token_from_cookie_header } from "./csrf_browser";

describe("csrf_token_from_cookie_header (#234)", () => {
  it("returns empty when the header is empty or the name is absent", () => {
    expect(csrf_token_from_cookie_header("")).toBe("");
    expect(csrf_token_from_cookie_header("other=value")).toBe("");
    expect(csrf_token_from_cookie_header(`${CSRF_COOKIE_NAME}_extra=nope`)).toBe(
      "",
    );
  });

  it("reads the token among other cookies", () => {
    expect(
      csrf_token_from_cookie_header(
        `__untangled_access=jwt; ${CSRF_COOKIE_NAME}=fresh-token; foo=bar`,
      ),
    ).toBe("fresh-token");
  });

  it("last matching pair wins", () => {
    expect(
      csrf_token_from_cookie_header(
        `${CSRF_COOKIE_NAME}=stale; ${CSRF_COOKIE_NAME}=fresh`,
      ),
    ).toBe("fresh");
  });
});
