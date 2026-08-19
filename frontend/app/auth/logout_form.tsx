import { Form } from "react-router";
import type { FormEvent } from "react";

import { csrf_token_from_document_cookie } from "./csrf_browser";

export type LogoutFormProps = {
  csrf_token: string;
  className?: string;
  button_className: string;
  button_role?: "menuitem";
};

export function LogoutForm({
  csrf_token,
  className,
  button_className,
  button_role,
}: LogoutFormProps) {
  function on_submit(event: FormEvent<HTMLFormElement>) {
    const current = csrf_token_from_document_cookie();
    if (current === "") {
      return;
    }
    const input = event.currentTarget.elements.namedItem("csrf_token");
    if (input instanceof HTMLInputElement) {
      input.value = current;
    }
  }

  return (
    <Form method="post" action="/logout" className={className} onSubmit={on_submit}>
      <input type="hidden" name="csrf_token" defaultValue={csrf_token} />
      <button type="submit" role={button_role} className={button_className}>
        Sign out
      </button>
    </Form>
  );
}
