import { describe, expect, it } from "vitest";

import { fk_open_related } from "./fk_open_related";

describe("fk_open_related", () => {
  it("F1: set + mapped references yields navigable detail href", () => {
    const open = fk_open_related(
      "incident",
      "01901234-5678-7abc-89ab-cdef01234567",
    );
    expect(open.navigable).toBe(true);
    expect(open.href).toBe(
      "/incidents/01901234-5678-7abc-89ab-cdef01234567",
    );
    expect(open.tooltip).toBe(
      "Open 01901234-5678-7abc-89ab-cdef01234567",
    );
  });

  it("F2: unset FK is non-navigable", () => {
    const open = fk_open_related("incident", null);
    expect(open.navigable).toBe(false);
    expect(open.href).toBeNull();
  });

  it("F3: set + unmapped class (user) is non-navigable", () => {
    const open = fk_open_related(
      "user",
      "01900000-0000-7000-8000-000000000001",
    );
    expect(open.navigable).toBe(false);
    expect(open.href).toBeNull();
    expect(open.tooltip).toBe(
      "Open 01900000-0000-7000-8000-000000000001",
    );
  });

  it("F4: tooltip uses Open {uuid} when set", () => {
    const open = fk_open_related("change-request", "abc");
    expect(open.tooltip).toBe("Open abc");
  });
});
