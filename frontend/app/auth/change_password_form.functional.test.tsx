/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutesStub } from "react-router";

import { ChangePasswordForm } from "./change_password_form";
import type { PasswordPolicy } from "./password_strength";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const POLICY: PasswordPolicy = {
  password_minimum_chars: 12,
  password_maximum_chars: 128,
  password_acceptable_crack_time_days: 1000,
  password_guess_per_second: 10000,
  password_estimate_drift_factor: 1.1,
};

function render_form(
  action_data?: { ok: true; detail: string } | { ok: false; detail: string },
) {
  const Stub = createRoutesStub([
    {
      path: "/change-password",
      Component: () => (
        <ChangePasswordForm
          username="ada"
          display_name="Ada Lovelace"
          policy={POLICY}
          action_data={action_data}
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/change-password"]} />);
}

describe("ChangePasswordForm (#173)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/v2/auth/csrf")) {
          return Response.json({ csrf_token: "c".repeat(32) });
        }
        return Response.json({
          ok: true,
          detail: "Password change complete.",
        });
      }),
    );
  });
  it("focuses Current Password on launch", () => {
    render_form();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Current Password"),
    );
  });

  it("masks each field independently with Eye / EyeOff", () => {
    render_form();

    const current = screen.getByLabelText("Current Password") as HTMLInputElement;
    const next = screen.getByLabelText("New Password") as HTMLInputElement;
    const verify = screen.getByLabelText(
      "Verify New Password",
    ) as HTMLInputElement;

    expect(current.type).toBe("password");
    expect(next.type).toBe("password");
    expect(verify.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show Current Password" }));
    expect(current.type).toBe("text");
    expect(next.type).toBe("password");
    expect(verify.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show New Password" }));
    expect(current.type).toBe("text");
    expect(next.type).toBe("text");
    expect(verify.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Hide New Password" }));
    expect(next.type).toBe("password");
  });

  it("blocks submit with rich client validation errors", async () => {
    render_form();
    const submit = screen.getByRole("button", { name: "Submit" });
    await waitFor(() => {
      expect((submit as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(submit);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Current password is required.");
    expect(alert.textContent).toContain("New password is required.");
  });

  it("updates live strength as the new password is typed", () => {
    render_form();

    expect(screen.getByTestId("password-strength").textContent).toContain(
      "Enter a new password",
    );

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "password" },
    });
    expect(screen.getByTestId("password-strength").textContent).toMatch(
      /Strength: (weak|moderate|acceptable|strong)/,
    );
  });

  it("Reset clears fields and remasks", () => {
    render_form();

    fireEvent.change(screen.getByLabelText("Current Password"), {
      target: { value: "old-secret" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "new-secret-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show Current Password" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(
      (screen.getByLabelText("Current Password") as HTMLInputElement).value,
    ).toBe("");
    expect((screen.getByLabelText("New Password") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Current Password") as HTMLInputElement).type,
    ).toBe("password");
    expect((screen.getByLabelText("New Password") as HTMLInputElement).type).toBe(
      "password",
    );
  });

  it("shows API success and failure messaging from action data", () => {
    const { unmount } = render_form({
      ok: true,
      detail: "Password change complete.",
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Password change complete.",
    );
    unmount();

    render_form({ ok: false, detail: "Password change failed." });
    expect(screen.getByRole("alert").textContent).toBe(
      "Password change failed.",
    );
  });
});
