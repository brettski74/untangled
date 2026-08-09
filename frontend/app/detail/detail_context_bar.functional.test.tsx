/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailContextBar } from "./detail_context_bar";

afterEach(() => {
  cleanup();
});

describe("DetailContextBar functional chrome (#113)", () => {
  it("F-B2/B3/B4: Save→Copy→Refresh; labelled bordered Save; dirty icon title", () => {
    const on_save = vi.fn();
    const on_refresh = vi.fn();
    const { rerender } = render(
      <DetailContextBar
        class_display_name="Incident"
        title_token="(new)"
        copy_url="/incident/new"
        dirty={false}
        save_enabled={true}
        on_save={on_save}
        on_refresh={on_refresh}
      />,
    );

    expect(screen.getByText("Incident (new)")).toBeTruthy();

    const save = screen.getByRole("button", { name: "Save" });
    const copy = screen.getByRole("button", { name: "Copy link" });
    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(save.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(copy.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(save.textContent).toContain("Save");
    expect(save.className).toMatch(/border/);
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(save.getAttribute("title")).toBe("Save (no changes)");

    rerender(
      <DetailContextBar
        class_display_name="Incident"
        title_token="(new)"
        copy_url="/incident/new"
        dirty={true}
        save_enabled={true}
        on_save={on_save}
        on_refresh={on_refresh}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("title")).toBe(
      "Save",
    );
  });

  it("F-F5: Save disabled when save_enabled false", () => {
    render(
      <DetailContextBar
        class_display_name="Incident"
        title_token="(new)"
        copy_url="/incident/new"
        dirty={false}
        save_enabled={false}
        on_save={vi.fn()}
        on_refresh={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("F-B: Save click and Refresh click invoke handlers", async () => {
    const on_save = vi.fn();
    const on_refresh = vi.fn();
    render(
      <DetailContextBar
        class_display_name="Incident"
        title_token="(new)"
        copy_url="/incident/new"
        dirty={true}
        save_enabled={true}
        on_save={on_save}
        on_refresh={on_refresh}
      />,
    );
    screen.getByRole("button", { name: "Save" }).click();
    screen.getByRole("button", { name: "Refresh" }).click();
    expect(on_save).toHaveBeenCalledTimes(1);
    expect(on_refresh).toHaveBeenCalledTimes(1);
  });

  it("F-cluster: right controls are only Save, Copy link, Refresh", () => {
    const { container } = render(
      <DetailContextBar
        class_display_name="Change Request"
        title_token="(new)"
        copy_url="/change_request/new"
        dirty={false}
        save_enabled={true}
        on_save={vi.fn()}
        on_refresh={vi.fn()}
      />,
    );
    const cluster = container.querySelector(".flex.shrink-0.items-center.gap-1");
    expect(cluster).toBeTruthy();
    const buttons = within(cluster as HTMLElement).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Save",
      "Copy link",
      "Refresh",
    ]);
  });
});
