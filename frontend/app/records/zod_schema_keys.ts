/**
 * Resolve object shape keys through ZodEffects / wrappers (e.g. superRefine).
 */
export function zod_object_shape_keys(schema: unknown): ReadonlySet<string> {
  let current: unknown = schema;
  for (let i = 0; i < 8; i += 1) {
    if (
      current != null &&
      typeof current === "object" &&
      "shape" in current &&
      (current as { shape: unknown }).shape != null &&
      typeof (current as { shape: unknown }).shape === "object"
    ) {
      return new Set(
        Object.keys((current as { shape: Record<string, unknown> }).shape),
      );
    }
    if (
      current != null &&
      typeof current === "object" &&
      "_def" in current &&
      (current as { _def: { schema?: unknown } })._def?.schema != null
    ) {
      current = (current as { _def: { schema: unknown } })._def.schema;
      continue;
    }
    break;
  }
  return new Set();
}
