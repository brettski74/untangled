/**
 * Change-password form UI: maskable fields, live strength, rich client validation.
 */
import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Form, useNavigation } from "react-router";

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
  on_change,
  on_toggle_mask,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  value: string;
  masked: boolean;
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
  action_data,
}: ChangePasswordFormProps) {
  const form_id = useId();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [verify_new_password, set_verify_new_password] = useState("");
  const [mask_current, set_mask_current] = useState(true);
  const [mask_new, set_mask_new] = useState(true);
  const [mask_verify, set_mask_verify] = useState(true);
  const [client_errors, set_client_errors] = useState<string[]>([]);
  const [success_message, set_success_message] = useState<string | null>(null);

  useEffect(() => {
    if (action_data?.ok === true) {
      set_current_password("");
      set_new_password("");
      set_verify_new_password("");
      set_mask_current(true);
      set_mask_new(true);
      set_mask_verify(true);
      set_client_errors([]);
      set_success_message(action_data.detail);
    } else if (action_data?.ok === false) {
      set_success_message(null);
    }
  }, [action_data]);

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
  }

  function on_submit(event: FormEvent<HTMLFormElement>) {
    const result = validate_change_password_form({
      current_password,
      new_password,
      verify_new_password,
      username,
      display_name,
      policy,
    });
    if (!result.ok) {
      event.preventDefault();
      set_client_errors(result.errors);
      set_success_message(null);
      return;
    }
    set_client_errors([]);
  }

  const api_failure =
    action_data?.ok === false ? action_data.detail : null;

  return (
    <Form
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
          disabled={submitting}
          className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
        >
          Submit
        </button>
        <button
          type="reset"
          disabled={submitting}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
        >
          Reset
        </button>
      </div>
    </Form>
  );
}
