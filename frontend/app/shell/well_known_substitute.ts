/**
 * Apply ``${snake_name}`` substitution using the generated catalog.
 * Catalog values and context allowlists come from ``make models`` only.
 * Clock tokens (``now`` / ``tomorrow``) are evaluation-environment values.
 */
import {
  SUBSTITUTION_CONTEXTS,
  WELL_KNOWN,
} from "../generated/well_known";

const TOKEN_RE = /\$\{([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\}/g;
const SECONDS_PER_DAY = 86400;

export class SubstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubstitutionError";
  }
}

/** Whole-second UTC ISO-8601 with a ``Z`` suffix (matches Python ``clock_env``). */
export function format_utc_iso_z(value: Date): string {
  const rounded = new Date(Math.round(value.getTime() / 1000) * 1000);
  return rounded.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function clock_env(now: Date = new Date()): Record<string, string> {
  const stamped = format_utc_iso_z(now);
  const tomorrow = format_utc_iso_z(
    new Date(new Date(stamped).getTime() + SECONDS_PER_DAY * 1000),
  );
  return { now: stamped, tomorrow };
}

/**
 * Replace ``${snake_name}`` tokens for ``context``.
 * Fail closed on unknown context, undefined name, or wrong-context use.
 * ``env`` cannot introduce names outside the context allowlist.
 */
export function substitute(
  text: string,
  context: string,
  env?: Record<string, string>,
): string {
  const available = SUBSTITUTION_CONTEXTS[context];
  if (available == null) {
    throw new SubstitutionError(
      `unknown substitution context: ${JSON.stringify(context)}`,
    );
  }
  const names = new Set(available);
  const catalog: Record<string, string> = { ...WELL_KNOWN, ...(env ?? {}) };
  TOKEN_RE.lastIndex = 0;

  return text.replace(TOKEN_RE, (_match, name: string) => {
    if (!names.has(name)) {
      throw new SubstitutionError(
        `substitution '\${${name}}' is not available in context ${JSON.stringify(context)}`,
      );
    }
    if (!(name in catalog)) {
      throw new SubstitutionError(
        `undefined substitution '\${${name}}' in context ${JSON.stringify(context)}`,
      );
    }
    return catalog[name]!;
  });
}

/** True when ``text`` still contains a ``${snake_name}`` token. */
export function has_substitution_token(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}
