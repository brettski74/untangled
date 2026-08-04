/**
 * Change Request schedule ordering compose (issue #127).
 * Hand-authored until class-definition cross-field codegen exists (#143).
 */
import { z } from "zod";

import {
  ChangeRequestCreateSchema,
  ChangeRequestUpdateSchema,
} from "../generated";

export const SCHEDULE_END_MSG = "must be greater than scheduled_start";

type ScheduleFields = {
  scheduled_start?: string | null;
  scheduled_end?: string | null;
};

function refine_schedule_order(data: ScheduleFields, ctx: z.RefinementCtx): void {
  const start = data.scheduled_start;
  const end = data.scheduled_end;
  if (start == null || end == null) {
    return;
  }
  if (end > start) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: SCHEDULE_END_MSG,
    path: ["scheduled_end"],
  });
}

/** Create schema with schedule ordering (both fields required by generated shape). */
export const ChangeRequestCreateWithScheduleSchema =
  ChangeRequestCreateSchema.superRefine(refine_schedule_order);

/**
 * Update schema with schedule ordering when both schedule fields are present
 * in the patch. Effective-pair checks for single-field patches stay on the API.
 */
export const ChangeRequestUpdateWithScheduleSchema =
  ChangeRequestUpdateSchema.superRefine(refine_schedule_order);
