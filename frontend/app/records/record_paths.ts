/**
 * Detail URL helpers for record hyperlinks (list → #71 detail pattern).
 * Path segment is live class `name` (snake), matching `/api/v2/{class_name}`.
 */
export function record_detail_path(
  class_name: string,
  locator: string,
): string {
  const encoded = encodeURIComponent(locator);
  return `/${class_name}/${encoded}`;
}
