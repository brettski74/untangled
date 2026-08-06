/**
 * Apply ``${kebab-name}`` substitution using the generated catalog.
 * Catalog values and context allowlists come from ``make models`` only.
 */
import {
  SUBSTITUTION_CONTEXTS,
  WELL_KNOWN,
} from "../generated/well_known";

const TOKEN_RE = /\$\{([a-z0-9]+(?:-[a-z0-9]+)*)\}/g;

export class SubstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubstitutionError";
  }
}

/**
 * Replace ``${kebab-name}`` tokens for ``context``.
 * Fail closed on unknown context, undefined name, or wrong-context use.
 */
export function substitute(text: string, context: string): string {
  const available = SUBSTITUTION_CONTEXTS[context];
  if (available == null) {
    throw new SubstitutionError(
      `unknown substitution context: ${JSON.stringify(context)}`,
    );
  }
  const names = new Set(available);

  return text.replace(TOKEN_RE, (_match, name: string) => {
    if (!(name in WELL_KNOWN)) {
      throw new SubstitutionError(
        `undefined substitution '\${${name}}' in context ${JSON.stringify(context)}`,
      );
    }
    if (!names.has(name)) {
      throw new SubstitutionError(
        `substitution '\${${name}}' is not available in context ${JSON.stringify(context)}`,
      );
    }
    return WELL_KNOWN[name]!;
  });
}

/** True when ``text`` still contains a ``${kebab-name}`` token. */
export function has_substitution_token(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}
