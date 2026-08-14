export function origin_is_exact_match(
  origin_header: string | undefined,
  public_origin: string,
): boolean {
  if (origin_header == null || origin_header === "") {
    return false;
  }
  return origin_header === public_origin;
}
