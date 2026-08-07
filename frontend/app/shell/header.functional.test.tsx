/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoutesStub } from "react-router";

import { ShellHeader } from "./header";

afterEach(() => {
  cleanup();
});

function render_header() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <ShellHeader display_name="Ada Lovelace" username="ada" />
      ),
    },
    { path: "/change-password", Component: () => null },
    { path: "/logout", action: () => null },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("ShellHeader identity menu (#172)", () => {
  it("opens a menu under display_name with Change Password above Sign out", () => {
    render_header();

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("title")).toBe("ada");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);

    const change_password = within(menu).getByRole("menuitem", {
      name: "Change Password",
    });
    const sign_out = within(menu).getByRole("menuitem", { name: "Sign out" });
    expect(
      change_password.compareDocumentPosition(sign_out) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(change_password.getAttribute("href")).toBe("/change-password");

    const logout_form = sign_out.closest("form");
    expect(logout_form).not.toBeNull();
    expect(logout_form?.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(logout_form?.getAttribute("action")).toBe("/logout");
    expect((sign_out as HTMLButtonElement).type).toBe("submit");
  });

  it("closes on Escape and outside click; toggle closes when open", () => {
    render_header();

    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the menu when Change Password is chosen", () => {
    render_header();

    fireEvent.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    const change_password = screen.getByRole("menuitem", {
      name: "Change Password",
    });
    // Prevent stub navigation (jsdom AbortSignal); still exercise menu onClick close.
    change_password.addEventListener("click", (event) => {
      event.preventDefault();
    });
    fireEvent.click(change_password);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
