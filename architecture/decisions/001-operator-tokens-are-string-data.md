# JSON string values are data, not identifiers — kebab-case operator tokens are allowed

## Context

Architecture review of issue #53 / epic #11 (search wire contract) flagged the kebab-case
operator vocabulary on search predicates (`not-empty`, `starts-with`, `ends-with`) as a
violation of the JSON `snake_case` naming constraint recorded in `constraints.md`
(AGENTS §3.7).

The human architect (Brettski74) ruled that this reading was wrong. The `snake_case`
convention exists so that names can be dereferenced as object members in JavaScript and
Python (`object.attribute_name`) without mental translation between layers. That rationale
applies to **keys and identifiers**, not to arbitrary **string data** carried inside a
JSON document.

## Decision

The `snake_case` naming constraint applies to JSON **keys** and to identifier-bearing
fields (attribute names, class names, and similar name-typed values).

It does **not** apply to JSON **string values** generally. Closed vocabularies expressed as
string data — predicate operator tokens, type-name tokens such as `friendly-id`, and
similar enumerated wire tokens — may use whichever form is easiest to read and type,
including kebab-case.

Concretely, the search wire contract's operator tokens (`eq`, `ne`, `empty`, `not-empty`,
`starts-with`, `ends-with`, …) are conformant as written. Future architecture reviews must
not re-flag them.

## Alternatives Considered

- **Force operator tokens to snake_case** (`not_empty`, `starts_with`). Rejected: buys no
  dereferenceability — these tokens are never member names — while costing typing
  ergonomics and churn on a contract already shipped and documented.
- **Drop the naming constraint for JSON entirely.** Rejected: key naming consistency across
  SQL, Python, and JSON is genuinely load-bearing and stays in force.
- **Case-insensitive operator parsing / accept both forms.** Rejected: two spellings for one
  token is a determinism and diff-stability problem, contrary to the canonical-serialization
  principle.

## Consequences

- `constraints.md` line on naming should be read as scoped to keys and identifier fields; a
  later `review-arch` pass may narrow its wording to say so explicitly.
- Enumerated string vocabularies now need an explicit choice of form per vocabulary. The
  default for closed operator/type token sets is kebab-case; attribute and class names
  remain `snake_case` wherever they appear, including as string values.
- No code or contract change follows from this ADR — it ratifies the existing search wire
  contract and removes a recurring false positive from architecture review.
