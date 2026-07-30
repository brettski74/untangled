/**
 * Unit tests for FK identity display and locator helpers.
 */
import { describe, expect, it } from "vitest";

import {
  fk_display_label,
  fk_identity_schema,
  fk_link_locator,
} from "./fk_identity";

describe("fk_identity helpers", () => {
  it("prefers trimmed display_name, then friendly_id, then id", () => {
    expect(
      fk_display_label({
        id: "0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
        display_name: "  Alex  ",
        friendly_id: "INC00000001",
      }),
    ).toBe("Alex");
    expect(
      fk_display_label({
        id: "0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
        display_name: "   ",
        friendly_id: " INC00000001 ",
      }),
    ).toBe("INC00000001");
    expect(
      fk_display_label({
        id: "0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
        display_name: null,
      }),
    ).toBe("0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
  });

  it("returns null for null FK and empty legacy strings", () => {
    expect(fk_display_label(null)).toBeNull();
    expect(fk_display_label("")).toBeNull();
    expect(fk_display_label("  ")).toBeNull();
  });

  it("locator prefers trimmed friendly_id then id", () => {
    expect(
      fk_link_locator({
        id: "0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
        friendly_id: " INC00000001 ",
      }),
    ).toBe("INC00000001");
    expect(
      fk_link_locator({
        id: "0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
        friendly_id: "  ",
      }),
    ).toBe("0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
  });

  it("rejects malformed identity objects", () => {
    expect(fk_identity_schema.safeParse({ display_name: "x" }).success).toBe(
      false,
    );
    expect(
      fk_identity_schema.safeParse({
        id: "u1",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
