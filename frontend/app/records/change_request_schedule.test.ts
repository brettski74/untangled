import { describe, expect, it } from "vitest";

import { format_api_error_detail } from "./api_error_detail";
import {
  ChangeRequestCreateWithScheduleSchema,
  ChangeRequestUpdateWithScheduleSchema,
  SCHEDULE_END_MSG,
} from "./change_request_schedule";
import {
  create_schema_for_class,
  create_schema_keys,
} from "./create_schema_registry";
import {
  update_schema_for_class,
  update_schema_keys,
} from "./update_schema_registry";
import { zod_error_detail } from "./zod_http_status";

const admin_id = "01900000-0000-7000-8000-000000000001";
const start = "2026-08-04T10:00:00Z";
const end_after = "2026-08-04T12:00:00Z";
const end_before = "2026-08-04T09:00:00Z";

const valid_create = {
  summary: "Window",
  status: "draft",
  scheduled_start: start,
  scheduled_end: end_after,
  requested_by: admin_id,
};

describe("change_request_schedule compose", () => {
  it("accepts end after start on create", () => {
    expect(
      ChangeRequestCreateWithScheduleSchema.safeParse(valid_create).success,
    ).toBe(true);
  });

  it("rejects end before start on create with canonical message", () => {
    const result = ChangeRequestCreateWithScheduleSchema.safeParse({
      ...valid_create,
      scheduled_end: end_before,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { detail } = zod_error_detail(result.error);
      expect(detail).toBe(`scheduled_end: ${SCHEDULE_END_MSG}`);
    }
  });

  it("rejects equal start and end on create", () => {
    const result = ChangeRequestCreateWithScheduleSchema.safeParse({
      ...valid_create,
      scheduled_end: start,
    });
    expect(result.success).toBe(false);
  });

  it("rejects both-field update when end is not after start", () => {
    const result = ChangeRequestUpdateWithScheduleSchema.safeParse({
      scheduled_start: start,
      scheduled_end: end_before,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { detail } = zod_error_detail(result.error);
      expect(detail).toBe(`scheduled_end: ${SCHEDULE_END_MSG}`);
    }
  });

  it("allows single-field update patches (API owns effective pair)", () => {
    expect(
      ChangeRequestUpdateWithScheduleSchema.safeParse({
        scheduled_end: end_before,
      }).success,
    ).toBe(true);
  });
});

describe("schema registries expose schedule compose", () => {
  it("create registry uses schedule rule and keeps shape keys", () => {
    const schema = create_schema_for_class("change-request")!;
    expect(create_schema_keys(schema).has("scheduled_end")).toBe(true);
    const bad = schema.safeParse({
      ...valid_create,
      scheduled_end: start,
    });
    expect(bad.success).toBe(false);
  });

  it("update registry keeps shape keys through refine", () => {
    const schema = update_schema_for_class("change-request")!;
    expect(update_schema_keys(schema).has("summary")).toBe(true);
  });
});

describe("format_api_error_detail", () => {
  it("formats FastAPI list detail with field path", () => {
    const text = format_api_error_detail(
      {
        detail: [
          {
            type: "value_error",
            loc: ["body", "scheduled_end"],
            msg: SCHEDULE_END_MSG,
          },
        ],
      },
      "fallback",
    );
    expect(text).toBe(`scheduled_end: ${SCHEDULE_END_MSG}`);
  });

  it("strips Pydantic Value error prefix", () => {
    const text = format_api_error_detail(
      {
        detail: [
          {
            loc: ["body", "scheduled_end"],
            msg: `Value error, ${SCHEDULE_END_MSG}`,
          },
        ],
      },
      "fallback",
    );
    expect(text).toBe(`scheduled_end: ${SCHEDULE_END_MSG}`);
  });
});
