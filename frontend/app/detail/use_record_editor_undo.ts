/**
 * ADR 007: Ctrl/Cmd+Z is form-subtree scoped. Clicking shell chrome often does
 * not move focus out of a controlled input; blur on outside pointer so undo
 * does not keep owning the keystroke after the operator left the editor.
 *
 * Outside blur is flushSync'd so commit-on-blur widgets (Time24Field) land in
 * draft state before a following Save click reads the editor snapshot.
 */
import { useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

export function use_record_editor_undo(
  form_ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  on_undo: () => void,
  on_leave_editor?: () => void,
): void {
  const on_undo_ref = useRef(on_undo);
  const on_leave_ref = useRef(on_leave_editor);
  on_undo_ref.current = on_undo;
  on_leave_ref.current = on_leave_editor;

  useEffect(() => {
    const node = form_ref.current;
    if (node == null || !enabled) {
      return;
    }
    const form = node;

    function on_keydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }
      if (event.shiftKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node) || !form.contains(target)) {
        return;
      }
      const active = document.activeElement;
      if (active == null || !form.contains(active)) {
        return;
      }
      event.preventDefault();
      on_undo_ref.current();
    }

    function on_pointer_down(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || form.contains(target)) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement && form.contains(active)) {
        flushSync(() => {
          active.blur();
          on_leave_ref.current?.();
        });
      }
    }

    form.addEventListener("keydown", on_keydown);
    document.addEventListener("pointerdown", on_pointer_down, true);
    return () => {
      form.removeEventListener("keydown", on_keydown);
      document.removeEventListener("pointerdown", on_pointer_down, true);
    };
  }, [form_ref, enabled]);
}
