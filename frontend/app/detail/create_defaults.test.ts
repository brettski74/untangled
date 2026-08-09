import { describe, expect, it } from "vitest";

import { class_field_meta } from "../generated/field_meta";
import {
  merge_create_body,
  preferred_create_locator,
  record_from_create_defaults,
} from "./create_defaults";
import {
  create_schema_for_class,
  create_schema_keys,
} from "../records/create_schema_registry";

const SEED_ADMIN = "01900000-0000-7000-8000-000000000001";

describe("record_from_create_defaults", () => {
  it("D1: INC seeds status=new; friendly_id and audit empty", () => {
    const meta = class_field_meta("incident")!;
    const seed = record_from_create_defaults(meta);
    expect(seed.status).toBe("new");
    expect(seed.number).toBeNull();
    expect(seed.summary).toBeNull();
    expect(seed.created_at).toBeNull();
    expect(seed.created_by).toBeNull();
    expect(seed.updated_at).toBeNull();
    expect(seed.updated_by).toBeNull();
  });

  it("D2: CHG seeds status=draft and requested_by seed UUID", () => {
    const meta = class_field_meta("change_request")!;
    const seed = record_from_create_defaults(meta);
    expect(seed.status).toBe("draft");
    expect(seed.requested_by).toBe(SEED_ADMIN);
    expect(seed.number).toBeNull();
    expect(seed.scheduled_start).toBeNull();
  });
});

describe("merge_create_body", () => {
  it("M1: merges RO FK create_default when client omits it", () => {
    const meta = class_field_meta("change_request")!;
    const merged = merge_create_body(meta, {
      summary: "Window",
      status: "draft",
      scheduled_start: "2026-02-01T00:00:00Z",
      scheduled_end: "2026-02-01T01:00:00Z",
    });
    expect(merged.requested_by).toBe(SEED_ADMIN);
    expect(merged.summary).toBe("Window");
    expect(merged.status).toBe("draft");
  });

  it("M2: ignores client override of RO FK default", () => {
    const meta = class_field_meta("change_request")!;
    const merged = merge_create_body(meta, {
      summary: "Window",
      status: "draft",
      scheduled_start: "2026-02-01T00:00:00Z",
      scheduled_end: "2026-02-01T01:00:00Z",
      requested_by: "01999999-9999-7999-8999-999999999999",
    });
    expect(merged.requested_by).toBe(SEED_ADMIN);
  });

  it("M3: strips friendly_id / id / audit even if client sends them", () => {
    const meta = class_field_meta("incident")!;
    const merged = merge_create_body(meta, {
      summary: "Outage",
      status: "new",
      severity: "High",
      number: "INC999",
      id: "01901234-5678-7abc-89ab-cdef01234567",
      created_at: "2026-01-01T00:00:00Z",
      created_by: SEED_ADMIN,
    });
    expect(merged).not.toHaveProperty("number");
    expect(merged).not.toHaveProperty("id");
    expect(merged).not.toHaveProperty("created_at");
    expect(merged).not.toHaveProperty("created_by");
    expect(merged.status).toBe("new");
  });

  it("M4: applies editable create_default when omitted", () => {
    const meta = class_field_meta("incident")!;
    const merged = merge_create_body(meta, {
      summary: "Outage",
      severity: "High",
    });
    expect(merged.status).toBe("new");
  });
});

describe("preferred_create_locator", () => {
  it("L1: prefers friendly_id over id", () => {
    const meta = class_field_meta("incident")!;
    expect(
      preferred_create_locator(meta, {
        id: "01901234-5678-7abc-89ab-cdef01234567",
        number: "INC00000001",
      }),
    ).toBe("INC00000001");
  });

  it("L2: falls back to id when friendly_id empty", () => {
    const meta = class_field_meta("incident")!;
    expect(
      preferred_create_locator(meta, {
        id: "01901234-5678-7abc-89ab-cdef01234567",
        number: null,
      }),
    ).toBe("01901234-5678-7abc-89ab-cdef01234567");
  });
});

describe("new_save_enabled", () => {
  it("S1: no create permission → disabled", async () => {
    const { new_save_enabled } = await import("./create_defaults");
    expect(
      new_save_enabled({
        can_create: false,
        dirty: true,
        create_valid: true,
        schema_available: true,
      }),
    ).toBe(false);
  });

  it("S2: clean + create-valid → enabled", async () => {
    const { new_save_enabled } = await import("./create_defaults");
    expect(
      new_save_enabled({
        can_create: true,
        dirty: false,
        create_valid: true,
        schema_available: true,
      }),
    ).toBe(true);
  });

  it("S3: clean + invalid → disabled", async () => {
    const { new_save_enabled } = await import("./create_defaults");
    expect(
      new_save_enabled({
        can_create: true,
        dirty: false,
        create_valid: false,
        schema_available: true,
      }),
    ).toBe(false);
  });

  it("S4: dirty + invalid → enabled (server final word)", async () => {
    const { new_save_enabled } = await import("./create_defaults");
    expect(
      new_save_enabled({
        can_create: true,
        dirty: true,
        create_valid: false,
        schema_available: true,
      }),
    ).toBe(true);
  });

  it("S5: schema miss → enabled when permitted", async () => {
    const { new_save_enabled } = await import("./create_defaults");
    expect(
      new_save_enabled({
        can_create: true,
        dirty: false,
        create_valid: false,
        schema_available: false,
      }),
    ).toBe(true);
  });
});

describe("create-valid from merged body (INC/CHG)", () => {
  it("V1: INC defaults alone are not create-valid", () => {
    const meta = class_field_meta("incident")!;
    const schema = create_schema_for_class("incident")!;
    const merged = merge_create_body(meta, {});
    expect(schema.safeParse(merged).success).toBe(false);
  });

  it("V2: INC with required fields is create-valid", () => {
    const meta = class_field_meta("incident")!;
    const schema = create_schema_for_class("incident")!;
    const merged = merge_create_body(meta, {
      summary: "Outage",
      severity: "High",
    });
    expect(schema.safeParse(merged).success).toBe(true);
    expect(merged.status).toBe("new");
  });

  it("V3: CHG defaults alone are not create-valid; requested_by still merged", () => {
    const meta = class_field_meta("change_request")!;
    const schema = create_schema_for_class("change_request")!;
    const merged = merge_create_body(meta, {});
    expect(merged.requested_by).toBe(SEED_ADMIN);
    expect(merged.status).toBe("draft");
    expect(schema.safeParse(merged).success).toBe(false);
  });

  it("V4: CHG with schedule + summary is create-valid including requested_by", () => {
    const meta = class_field_meta("change_request")!;
    const schema = create_schema_for_class("change_request")!;
    const merged = merge_create_body(meta, {
      summary: "Window",
      scheduled_start: "2026-02-01T00:00:00Z",
      scheduled_end: "2026-02-01T01:00:00Z",
    });
    expect(schema.safeParse(merged).success).toBe(true);
    expect(merged.requested_by).toBe(SEED_ADMIN);
  });
});

describe("create_schema_registry", () => {
  it("R1: resolves known Create schemas", () => {
    expect(create_schema_for_class("incident")).not.toBeNull();
    expect(create_schema_for_class("change_request")).not.toBeNull();
    const schema = create_schema_for_class("incident")!;
    expect(create_schema_keys(schema).has("summary")).toBe(true);
    expect(create_schema_keys(schema).has("number")).toBe(false);
  });

  it("R2: unknown class is observable null", () => {
    expect(create_schema_for_class("not-a-class")).toBeNull();
  });
});
