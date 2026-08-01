/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { LocalDatetimeInput } from "../datetime/local_datetime_input";
import { commit_active_editor_field } from "./commit_active_editor_field";

afterEach(() => {
  cleanup();
});

/**
 * Mirrors destination_new / destination_detail Save: keep draft in a ref that
 * tracks the latest render, flush active field, then read the ref for submit.
 */
function SaveHarness({
  initial,
  on_save,
}: {
  initial: string;
  on_save: (value: string | null) => void;
}) {
  const [draft, set_draft] = useState<string | null>(initial);
  const draft_ref = useRef(draft);
  draft_ref.current = draft;
  const form_ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={form_ref}>
      <LocalDatetimeInput
        id="harness-dt"
        value={draft}
        editable
        on_change={(next) => set_draft(next)}
      />
      <button
        type="button"
        onClick={() => {
          commit_active_editor_field(form_ref.current);
          on_save(draft_ref.current);
        }}
      >
        Save
      </button>
    </div>
  );
}

describe("commit_active_editor_field", () => {
  it("flushes Time24Field draft into parent state before Save reads it", () => {
    let saved: string | null | undefined;
    render(
      <SaveHarness
        initial="2026-02-01T00:00:00Z"
        on_save={(value) => {
          saved = value;
        }}
      />,
    );

    const time = screen.getByLabelText("Time") as HTMLInputElement;
    time.focus();
    fireEvent.change(time, { target: { value: "15:30:00" } });

    // Without flushSync blur, Save would still see 00:00:00.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saved).toMatch(/T15:30:00/);
  });

  it("no-ops when focus is outside the editor form", () => {
    let saved: string | null | undefined;
    render(
      <>
        <input aria-label="outside" />
        <SaveHarness
          initial="2026-02-01T00:00:00Z"
          on_save={(value) => {
            saved = value;
          }}
        />
      </>,
    );

    const outside = screen.getByLabelText("outside");
    outside.focus();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saved).toBe("2026-02-01T00:00:00Z");
  });
});
