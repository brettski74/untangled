/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { class_field_meta } from "../generated/field_meta";
import { record_from_create_defaults } from "./create_defaults";
import { partition_detail_layout } from "./default_layout";
import {
  create_editor_snapshot,
  editable_field_names,
} from "./detail_editor";
import { DetailForm } from "./detail_form";

afterEach(() => {
  cleanup();
});

const SEED_ADMIN = "01900000-0000-7000-8000-000000000001";

function render_new_form(class_kebab: string, can_update = true) {
  const meta = class_field_meta(class_kebab)!;
  const layout = partition_detail_layout(meta);
  const seed = record_from_create_defaults(meta);
  const editable = editable_field_names(layout);
  const editor = create_editor_snapshot(seed, editable);
  const on_field_change = vi.fn();
  const on_field_focus = vi.fn();
  const on_field_blur = vi.fn();
  render(
    <DetailForm
      layout={layout}
      record={seed}
      draft={editor.draft}
      can_update={can_update}
      on_field_change={on_field_change}
      on_field_focus={on_field_focus}
      on_field_blur={on_field_blur}
    />,
  );
  return { meta, layout, seed, editable, editor, on_field_change };
}

describe("DetailForm new-record functional surface (#83 / #109)", () => {
  it("F-C1/B8/B9: INC seed shows status=new; no id; friendly_id empty RO", () => {
    render_new_form("incident");
    const status = screen.getByLabelText(/Status/i) as HTMLInputElement;
    expect(status.value).toBe("new");
    expect(status.readOnly).toBe(false);

    expect(document.getElementById("detail-id")).toBeNull();

    const number = screen.getByLabelText(/Number/i) as HTMLInputElement;
    expect(number.value).toBe("");
    expect(number.readOnly).toBe(true);
  });

  it("F-C2/B11: CHG seed shows status=draft and requested_by seed UUID as RO FK", () => {
    render_new_form("change_request");
    const status = screen.getByLabelText(/Status/i) as HTMLInputElement;
    expect(status.value).toBe("draft");

    const requested = screen.getByLabelText(/Requested By/i) as HTMLSelectElement;
    expect(requested.disabled).toBe(true);
    expect(requested.value).toBe(SEED_ADMIN);
    const open = within(requested.parentElement as HTMLElement).getByRole(
      "link",
      { name: `Open ${SEED_ADMIN}` },
    );
    expect(open.getAttribute("href")).toBe(`/user/${SEED_ADMIN}`);
  });

  it("F-E1: CHG scheduled datetime uses date + 24h time, not datetime-local", () => {
    render_new_form("change_request");

    const start_date = document.getElementById(
      "detail-scheduled_start",
    ) as HTMLInputElement;
    expect(start_date).toBeTruthy();
    expect(start_date.type).toBe("date");
    expect(start_date.disabled).toBe(false);

    const end_date = document.getElementById(
      "detail-scheduled_end",
    ) as HTMLInputElement;
    expect(end_date.type).toBe("date");

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();

    // Time pair companions are labelled "Time" (product dual-control chrome).
    const times = screen.getAllByLabelText("Time");
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (const time of times) {
      expect((time as HTMLInputElement).type).toBe("text");
    }
  });

  it("F-B10: audit fields present and empty/disabled on new", () => {
    render_new_form("incident");
    const created_at = document.getElementById(
      "detail-created_at",
    ) as HTMLInputElement;
    expect(created_at).toBeTruthy();
    expect(created_at.type).toBe("date");
    expect(created_at.disabled).toBe(true);
    expect(created_at.value).toBe("");
  });

  it("F-D6: FKs and friendly_id stay non-editable; summary editable when can_update", () => {
    render_new_form("incident", true);
    expect((screen.getByLabelText(/Number/i) as HTMLInputElement).readOnly).toBe(
      true,
    );
    expect(
      (screen.getByLabelText(/Assigned User/i) as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/^Summary$/i) as HTMLInputElement).readOnly,
    ).toBe(false);
  });

  it("F-no-create UI: without can_update author fields read-only", () => {
    render_new_form("incident", false);
    expect((screen.getByLabelText(/Status/i) as HTMLInputElement).readOnly).toBe(
      true,
    );
    expect(
      (screen.getByLabelText(/^Summary$/i) as HTMLInputElement).readOnly,
    ).toBe(true);
  });

  it("F-D1: editing summary calls on_field_change", () => {
    const { on_field_change } = render_new_form("incident");
    const summary = screen.getByLabelText(/^Summary$/i) as HTMLInputElement;
    fireEvent.change(summary, { target: { value: "Outage" } });
    expect(on_field_change).toHaveBeenCalledWith("summary", "Outage");
  });

  it("F-layout: compact + text sections present", () => {
    render_new_form("incident");
    expect(screen.getByRole("region", { name: "Compact fields" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Text fields" })).toBeTruthy();
  });
});
