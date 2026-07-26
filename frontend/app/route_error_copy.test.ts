import { describe, expect, it } from "vitest";

import { route_error_copy, unexpected_error_copy } from "./route_error_copy";

describe("route_error_copy", () => {
  it("maps 404 to not-found copy", () => {
    expect(route_error_copy(404, "")).toEqual({
      message: "404",
      details: "The requested page could not be found.",
    });
  });

  it("maps 403 to access-denied copy without relying on statusText", () => {
    expect(route_error_copy(403, "")).toEqual({
      message: "403",
      details: "Access is denied.",
    });
    expect(route_error_copy(403, "Forbidden")).toEqual({
      message: "403",
      details: "Access is denied.",
    });
  });

  it("uses status as heading and statusText when present for other HTTP errors", () => {
    expect(route_error_copy(409, "Conflict")).toEqual({
      message: "409",
      details: "Conflict",
    });
  });

  it("falls back to a clear default when statusText is empty", () => {
    expect(route_error_copy(400, "")).toEqual({
      message: "400",
      details: "Request could not be completed.",
    });
    expect(route_error_copy(502, "   ")).toEqual({
      message: "502",
      details: "Request could not be completed.",
    });
  });
});

describe("unexpected_error_copy", () => {
  it("keeps the non-Response fallback copy", () => {
    expect(unexpected_error_copy()).toEqual({
      message: "Oops!",
      details: "An unexpected error occurred.",
    });
  });
});
