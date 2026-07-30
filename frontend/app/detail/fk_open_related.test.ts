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

  it("F1b: identity object prefers friendly_id locator and display label", () => {
    const open = fk_open_related("incident", {
      id: "01901234-5678-7abc-89ab-cdef01234567",
      display_name: "Outbound email",
      friendly_id: "INC00000001",
    });
    expect(open.navigable).toBe(true);
    expect(open.href).toBe("/incidents/INC00000001");
    expect(open.tooltip).toBe("Open Outbound email");
  });

  it("F1c: encodes friendly-id locator segments", () => {
    const open = fk_open_related("incident", {
      id: "01901234-5678-7abc-89ab-cdef01234567",
      friendly_id: "INC/odd",
    });
    expect(open.href).toBe("/incidents/INC%2Fodd");
  });

  it("F2: unset FK is non-navigable", () => {
    const open = fk_open_related("incident", null);
    expect(open.navigable).toBe(false);
    expect(open.href).toBeNull();
  });

  it("F3: set + unmapped class (user) is non-navigable", () => {
    const open = fk_open_related("user", {
      id: "01900000-0000-7000-8000-000000000001",
      display_name: "Admin",
    });
    expect(open.navigable).toBe(false);
    expect(open.href).toBeNull();
    expect(open.tooltip).toBe("Open Admin");
  });

  it("F4: tooltip uses Open {uuid} when set", () => {
    const open = fk_open_related("change-request", "abc");
    expect(open.tooltip).toBe("Open abc");
  });
});
