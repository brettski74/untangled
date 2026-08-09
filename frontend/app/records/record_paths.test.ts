import { describe, expect, it } from "vitest";

import { is_known_class } from "../shell/nav_paths";
import { record_detail_path } from "./record_paths";

describe("record_detail_path", () => {
  it("builds /:class_name/:locator with encoding", () => {
    expect(record_detail_path("incident", "INC00000001")).toBe(
      "/incident/INC00000001",
    );
    expect(
      record_detail_path(
        "change_request",
        "01901234-5678-7abc-89ab-cdef01234567",
      ),
    ).toBe("/change_request/01901234-5678-7abc-89ab-cdef01234567");
  });
});

describe("known class fail-closed", () => {
  it("accepts schema classes and rejects unknown names", () => {
    expect(is_known_class("incident")).toBe(true);
    expect(is_known_class("user")).toBe(true);
    expect(is_known_class("not_a_real_class")).toBe(false);
  });
});
