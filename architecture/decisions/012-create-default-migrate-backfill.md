# `create-default` backfills required column adds

## Context

YAML class definitions are the source of truth for schema intent; migrate plans are derived from them (tradeoffs: YAML vs migration history). Adding a required (`NOT NULL`) attribute to a non-empty table needs a value for existing rows. Human direction for #171 / #62 forbids class- or table-scoped migrate special cases: ADD COLUMN behaviour must be general.

Docs historically treated `create-default` as create-path / UX only, so it never reached schema IR. Leaving migrate backfill as ticket-local inventiveness (per-class hacks, silent NULLable DML, or a second YAML key without a recorded rule) would fragment how class authors express “value for new and existing rows when the column appears.”

The required outcome is: required AddColumn with an author-supplied default succeeds on populated tables; required AddColumn without a default fails on populated tables; steady-state schema has no permanent PostgreSQL COLUMN DEFAULT.

## Decision

For **required** attribute adds, `create-default` is also the **migrate add-time backfill** value:

1. Plan `ADD COLUMN … NOT NULL DEFAULT <literal>` from that attribute’s `create-default`, then `DROP DEFAULT` in the **same** migrate transaction so desired/introspected column identity stays `(name, type, nullable)` with **no** lasting table default.
2. Required AddColumn **without** `create-default` stays `ADD … NOT NULL` with no DEFAULT — empty tables succeed; non-empty tables fail (correct; no invented silent backfill).
3. Optional (`NULL`) adds do not require a default for this rule.
4. Temporary DEFAULT is **add-op metadata**, not durable desired-schema / `ColumnIR` equality state.
5. Prefer this DDL path over NULLABLE→DML→SET NOT NULL while MigrationOp remains DDL-only; do not introduce DML ops solely for AddColumn when DROP DEFAULT suffices.
6. Facility is **general** across classes — not system-config-only. Create-path / API create behaviour of `create-default` remains; this extends it, it does not replace it with a DB default.

Optional→required tighten on an existing nullable column (UPDATE + SET NOT NULL) remains a separate #62 residual unless a later decision covers it.

## Alternatives Considered

- **Table- or class-scoped migrate special case (e.g. only `system_config`).** Overruled by human: migrate/table-creation facilities must apply generally.
- **Separate YAML `migrate-default` / `backfill-default`.** Rejected for now: two keys for one literal invite drift and violate consistency / optimize-for-laziness when create and backfill should match; revisit if create-path and historical backfill must diverge.
- **Permanent PostgreSQL COLUMN DEFAULT in desired schema.** Rejected: create-default is create/migrate-fill semantics, not a lasting DB default that hides missing writes.
- **NULLABLE add → DML backfill → SET NOT NULL as the primary path.** Deferred: workable, but expands MigrationOp beyond DDL-only; use only if DROP DEFAULT cannot express a needed type.

## Consequences

- Declaring `create-default` on a **required** attribute commits authors to backfilling **all existing rows** with that literal when the column is added — review that as data migration intent, not only UX.
- Literal compilation must cover every type that may carry `create-default` (at least integers and decimals for #171; extend as attributes need).
- Large-table `ADD COLUMN … DEFAULT` may rewrite/lock under PostgreSQL; operators must treat migrate as consequential (existing intentional-migrate tradeoff).
- Docs (`class-definitions.md`) and #62 tracking must describe the dual role; this ADR is binding until a later `review-arch` updates main architecture docs.
- Primary agents must commit this ADR with the work that lands the facility; the human must be informed (may warrant later `review-arch`).
