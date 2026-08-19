/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoutesStub } from "react-router";

import { CSRF_COOKIE_NAME } from "./cookie_names";
import { LogoutForm } from "./logout_form";

function clear_csrf_cookie() {
  document.cookie = `${CSRF_COOKIE_NAME}=; max-age=0`;
}

afterEach(() => {
  cleanup();
  clear_csrf_cookie();
});

function submitted_csrf(loader_token: string): FormData {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <LogoutForm csrf_token={loader_token} button_className="sign-out" />
      ),
    },
    { path: "/logout", action: () => null },
  ]);
  render(<Stub initialEntries={["/"]} />);
  const form = screen.getByRole("button", { name: "Sign out" }).closest(
    "form",
  );
  expect(form).not.toBeNull();
  // Skip RR client navigation (jsdom AbortSignal); still run React onSubmit.
  form!.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
    },
    { capture: true },
  );
  fireEvent.submit(form!);
  return new FormData(form!);
}

describe("LogoutForm submit-time CSRF sync (#234)", () => {
  it("puts the current document cookie in FormData, not the loader snapshot", () => {
    document.cookie = `${CSRF_COOKIE_NAME}=fresh`;
    expect(submitted_csrf("stale").get("csrf_token")).toBe("fresh");
  });

  it("keeps the loader snapshot in FormData when no CSRF cookie is present", () => {
    clear_csrf_cookie();
    expect(submitted_csrf("stale").get("csrf_token")).toBe("stale");
  });
});
