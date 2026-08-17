/**
 * Change-password form UI: maskable fields, live strength, rich client validation.
 * Browser posts to the auth service (CSRF + Origin), same pattern as login.
 */
import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { change_password_response_schema } from "./schemas";
import {
  evaluate_new_password_strength,
  validate_change_password_form,
  type PasswordPolicy,
  type StrengthClass,
} from "./password_strength";

export type ChangePasswordActionData =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

export type ChangePasswordFormProps = {
  username: string;
  display_name: string;
  policy: PasswordPolicy;
  after_success?: "stay" | "home";
  action_data?: ChangePasswordActionData;
};

function strength_label(classification: StrengthClass | null): string {
  if (classification == null) {
    return "Enter a new password to see strength.";
  }
  return `Strength: ${classification}`;
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  value,
  masked,
  autoFocus = false,
  on_change,
  on_toggle_mask,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  value: string;
  masked: boolean;
  autoFocus?: boolean;
  on_change: (value: string) => void;
  on_toggle_mask: () => void;
}): ReactNode {
  const toggle_label = masked ? `Show ${label}` : `Hide ${label}`;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={masked ? "password" : "text"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => on_change(event.target.value)}
          className="w-full rounded border border-slate-300 bg-white py-2 pr-10 pl-3 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label={toggle_label}
          aria-pressed={!masked}
          onClick={on_toggle_mask}
        >
          {masked ? (
            <Eye className="h-4 w-4" aria-hidden="true" />
          ) : (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </label>
  );
}

export function ChangePasswordForm({
  username,
  display_name,
  policy,
  after_success = "stay",
  action_data,
}: ChangePasswordFormProps) {
  const form_id = useId();

  const [csrf, set_csrf] = useState("");
  const [pending, set_pending] = useState(false);
  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [verify_new_password, set_verify_new_password] = useState("");
  const [mask_current, set_mask_current] = useState(true);
  const [mask_new, set_mask_new] = useState(true);
  const [mask_verify, set_mask_verify] = useState(true);
  const [client_errors, set_client_errors] = useState<string[]>([]);
  const [success_message, set_success_message] = useState<string | null>(
    action_data?.ok === true ? action_data.detail : null,
  );
  const [api_failure, set_api_failure] = useState<string | null>(
    action_data?.ok === false ? action_data.detail : null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/auth/csrf", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("csrf");
        }
        const body: unknown = await response.json();
        const token =
          typeof body === "object" &&
          body != null &&
          "csrf_token" in body &&
          typeof body.csrf_token === "string"
            ? body.csrf_token
            : "";
        if (!cancelled) {
          set_csrf(token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          set_api_failure("Unable to start password change. Refresh and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const strength =
    new_password.length === 0
      ? null
      : evaluate_new_password_strength(new_password, {
          username,
          display_name,
          policy,
        });

  function reset_form() {
    set_current_password("");
    set_new_password("");
    set_verify_new_password("");
    set_mask_current(true);
    set_mask_new(true);
    set_mask_verify(true);
    set_client_errors([]);
    set_success_message(null);
    set_api_failure(null);
  }

  async function on_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate_change_password_form({
      current_password,
      new_password,
      verify_new_password,
      username,
      display_name,
      policy,
    });
    if (!result.ok) {
      set_client_errors(result.errors);
      set_success_message(null);
      set_api_failure(null);
      return;
    }
    if (csrf === "") {
      set_client_errors([]);
      set_api_failure("Unable to start password change. Refresh and try again.");
      return;
    }
    set_client_errors([]);
    set_api_failure(null);
    set_pending(true);
    try {
      const response = await fetch("/api/v2/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          csrf_token: csrf,
          current_password,
          new_password,
          verify_new_password,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (response.status === 403) {
        set_api_failure(
          "Password change was blocked from this origin. Use the exact site address, then refresh.",
        );
        return;
      }
      if (response.status === 422) {
        let detail = "Password change failed.";
        try {
          const payload: unknown = await response.json();
          detail = change_password_response_schema.parse(payload).detail;
        } catch {
          // Keep generic failure when body is missing or malformed.
        }
        set_api_failure(detail || "Password change failed.");
        return;
      }
      if (!response.ok) {
        set_api_failure("Password change failed.");
        return;
      }
      let detail = "Password change complete.";
      try {
        const payload: unknown = await response.json();
        detail = change_password_response_schema.parse(payload).detail;
      } catch {
        // Keep generic success copy when body is missing or malformed.
      }
      if (after_success === "home") {
        window.location.assign("/");
        return;
      }
      set_current_password("");
      set_new_password("");
      set_verify_new_password("");
      set_mask_current(true);
      set_mask_new(true);
      set_mask_verify(true);
      set_success_message(detail);
    } catch {
      set_api_failure("Password change failed.");
    } finally {
      set_pending(false);
    }
  }

  return (
    <form
      method="post"
      className="mx-auto max-w-md space-y-4 px-4 py-6"
      onSubmit={on_submit}
      onReset={(event) => {
        event.preventDefault();
        reset_form();
      }}
    >
      <PasswordField
        id={`${form_id}-current`}
        name="current_password"
        label="Current Password"
        autoComplete="current-password"
        autoFocus
        value={current_password}
        masked={mask_current}
        on_change={set_current_password}
        on_toggle_mask={() => set_mask_current((v) => !v)}
      />
      <PasswordField
        id={`${form_id}-new`}
        name="new_password"
        label="New Password"
        autoComplete="new-password"
        value={new_password}
        masked={mask_new}
        on_change={set_new_password}
        on_toggle_mask={() => set_mask_new((v) => !v)}
      />
      <p
        className="text-sm text-slate-600"
        data-testid="password-strength"
        aria-live="polite"
      >
        {strength_label(strength?.classification ?? null)}
      </p>
      <PasswordField
        id={`${form_id}-verify`}
        name="verify_new_password"
        label="Verify New Password"
        autoComplete="new-password"
        value={verify_new_password}
        masked={mask_verify}
        on_change={set_verify_new_password}
        on_toggle_mask={() => set_mask_verify((v) => !v)}
      />

      {client_errors.length > 0 ? (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          <ul className="list-disc space-y-1 pl-5">
            {client_errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {api_failure != null ? (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {api_failure}
        </p>
      ) : null}

      {success_message != null ? (
        <p
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {success_message}
        </p>
      ) : null}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending || csrf === ""}
          className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
        >
          Submit
        </button>
        <button
          type="reset"
          disabled={pending}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
