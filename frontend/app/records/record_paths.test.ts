import { describe, expect, it } from "vitest";

import { collection_for_class } from "../shell/nav_paths";
import { record_detail_path } from "./record_paths";

describe("record_detail_path", () => {
  it("builds /:collection/:locator with encoding", () => {
    expect(record_detail_path("incidents", "INC00000001")).toBe(
      "/incidents/INC00000001",
    );
    expect(
      record_detail_path(
        "change-requests",
        "01901234-5678-7abc-89ab-cdef01234567",
      ),
    ).toBe("/change-requests/01901234-5678-7abc-89ab-cdef01234567");
  });
});

describe("FK collection mapping fail-closed", () => {
  it("has no collection for user (list renders plain UUID text)", () => {
    expect(collection_for_class("user")).toBeNull();
    expect(collection_for_class("incident")).toBe("incidents");
  });
});
