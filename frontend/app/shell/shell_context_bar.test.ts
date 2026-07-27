import { describe, expect, it } from "vitest";

import {
  claim_shell_context_bar_occupant,
  release_shell_context_bar_occupant,
  SHELL_CONTEXT_BAR_DUAL_OCCUPANT_ERROR,
} from "./shell_context_bar";

describe("shell context bar occupancy", () => {
  it("claims the first occupant and releases back to empty", () => {
    const occupied = claim_shell_context_bar_occupant(0);
    expect(occupied).toBe(1);
    expect(release_shell_context_bar_occupant(occupied)).toBe(0);
  });

  it("fails closed on a second concurrent claim", () => {
    expect(() => claim_shell_context_bar_occupant(1)).toThrow(
      SHELL_CONTEXT_BAR_DUAL_OCCUPANT_ERROR,
    );
  });
});
