/**
 * Map Zod issues to domain-aligned HTTP status (structural 400 / semantic 422).
 */
import type { ZodError, ZodIssue } from "zod";

function issue_is_structural(issue: ZodIssue): boolean {
  if (issue.code === "unrecognized_keys") {
    return true;
  }
  if (issue.code === "invalid_type") {
    // Wrong root shape (expected object, got array/string/etc.).
    if (issue.path.length === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Structural (parse/shape/unknown keys) → 400;
 * constraint / field type / cross-field → 422.
 */
export function zod_error_http_status(error: ZodError): 400 | 422 {
  if (error.issues.some(issue_is_structural)) {
    return 400;
  }
  return 422;
}

export function zod_error_detail(error: ZodError): {
  detail: string;
  issues: ZodIssue[];
} {
  return {
    detail: error.issues.map((i) => i.message).join("; ") || "Validation failed",
    issues: error.issues,
  };
}
