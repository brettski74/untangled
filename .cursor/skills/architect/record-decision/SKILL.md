---
name: record-decision
description: >-
  Write an Architecture Decision Record under /architecture/decisions/ when
  change-review or another architect flow has already determined an
  architectural adjustment must be recorded. Use when invoked to create an ADR;
  do not re-litigate necessity.
---

# Record architecture decision (ADR)

Use this skill when the architect must **write** an ADR after the caller (typically `change-review`) has already decided an architectural adjustment is required. Also callable standalone from other architect flows when that determination is already made.

## Hard rules

- **ADRs only.** Write exclusively under `/architecture/decisions/`. Do **not** edit main architecture docs (`principles.md`, `constraints.md`, `boundaries.md`, `tradeoffs.md`, `unknowns.md`).
- **Trust the caller.** Necessity was decided before this skill ran—write the ADR; do not re-check whether one is needed.
- **Notify upward.** After writing, tell the primary agent: the ADR path, a one-line summary, that the human must be informed (may warrant later `review-arch`), and that the primary agent must **include this ADR file in its commits** alongside the current work.
- Keep ADR bodies **concise and high-signal**. Do not dump implementation detail or duplicate `AGENTS.md`.

## Filename convention

```text
/architecture/decisions/<NNN>-<kebab-case-summary>.md
```

- `<NNN>`: monotonically increasing integer, **zero-padded to three digits**. Take the largest numeric prefix among existing ADR files in `decisions/`, add 1. If none exist, use `001`. Ignore non-ADR placeholders (e.g. `.gitkeep`).
- `<kebab-case-summary>`: short summary of the decision nature, **maximum 5 words**, kebab-case.

Examples: `001-uuidv7-primary-keys.md`, `002-js-sandbox-runtime.md`.

## ADR template

Write the file using this structure (fill in real content; keep the section headings):

```text
# Title

## Context
What situation led to this decision?

## Decision
What was decided?

## Alternatives Considered
What other options were evaluated?

## Consequences
What are the tradeoffs or implications?
```

## Steps

1. **Choose filename** per the convention above (scan `decisions/` for the next `NNN`).
2. **Write** the ADR file to `/architecture/decisions/` using the template. Do not modify main architecture docs.
3. **Notify** the caller/primary agent with:
   - full path of the new ADR file
   - one-line summary of the decision
   - request to **commit that file with the current work**
   - instruction that the **human must be informed** (may need later `review-arch`)

## Notes

- Out of scope: incorporating ADRs into main docs (`review-arch`), workflow hooks, and `change-review` itself.
