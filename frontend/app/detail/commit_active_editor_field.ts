/**
 * Flush commit-on-blur editor widgets (e.g. Time24Field) before Save / Ctrl+S
 * reads draft state. Without this, an in-progress time draft is omitted from
 * the create/update body and the wrong datetime can be persisted.
 */
import { flushSync } from "react-dom";

export function commit_active_editor_field(form: HTMLElement | null): void {
  const active = document.activeElement;
  if (
    !(active instanceof HTMLElement) ||
    form == null ||
    !form.contains(active)
  ) {
    return;
  }
  flushSync(() => {
    active.blur();
  });
}
