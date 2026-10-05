import { describe, expect, it } from "vitest";

import { prepare_create_body, prepare_update_body } from "./mutation_body";

const SEED_ADMIN = "01900000-0000-7000-8000-000000000001";

describe("prepare_create_body", () => {
  it("merges defaults and strips id/friendly_id", () => {
    const prepared = prepare_create_body(
      "incident",
      { summary: "Outage", severity: "High" },
      { current_user_id: SEED_ADMIN },
    );
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.body).toMatchObject({
        summary: "Outage",
        severity: "High",
        status: "new",
      });
      expect(prepared.body).not.toHaveProperty("number");
      expect(prepared.body).not.toHaveProperty("id");
    }
  });

  it("retains change_request requested_by when the client omits it", () => {
    const prepared = prepare_create_body("change_request", {
      summary: "Window",
      status: "draft",
      scheduled_start: "2026-02-01T00:00:00Z",
      scheduled_end: "2026-02-01T01:00:00Z",
    });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.body).toMatchObject({ requested_by: SEED_ADMIN });
    }
  });

  it("returns 422 on field type failure and missing required", () => {
    const type_fail = prepare_create_body("incident", {
      summary: "Outage",
      status: "new",
      severity: "High",
      major_incident: "not-a-boolean",
    });
    expect(type_fail).toMatchObject({ ok: false, status: 422 });

    const missing = prepare_create_body("incident", { status: "new" });
    expect(missing).toMatchObject({ ok: false, status: 422 });
  });
});

describe("prepare_update_body", () => {
  it("accepts a valid patch", () => {
    const prepared = prepare_update_body("incident", { status: "in-progress" });
    expect(prepared).toEqual({
      ok: true,
      body: { status: "in-progress" },
    });
  });

  it("returns 400 on unrecognized attributes", () => {
    const prepared = prepare_update_body("incident", { not_a_field: "x" });
    expect(prepared).toMatchObject({ ok: false, status: 400 });
  });

  it("returns 422 on field type failure", () => {
    const prepared = prepare_update_body("incident", {
      assigned_user_id: "not-a-uuid",
    });
    expect(prepared).toMatchObject({ ok: false, status: 422 });
  });
});
