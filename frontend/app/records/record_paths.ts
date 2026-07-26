/**
 * Detail URL helpers for record hyperlinks (list → #71 detail pattern).
 */
export function record_detail_path(
  collection: string,
  locator: string,
): string {
  const encoded = encodeURIComponent(locator);
  return `/${collection}/${encoded}`;
}
