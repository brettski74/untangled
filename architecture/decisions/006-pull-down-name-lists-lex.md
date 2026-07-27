# Pull-down name lists are lexicographic

## Context

ADR 004 makes class-definition attribute declaration order semantic for **presenting
attributes** as fields on a form or columns in a list — so related information can be
grouped and more important information can appear ahead of less important. That motivation
is about the nature of the data in those attributes.

A separate UX case is a **pull-down (PD) list of names** used to pick an attribute (or
similar label) when the data values are not shown. Findability dominates: once the list is
long enough to scroll, arbitrary or layout-ordinal order makes the control hard to use.
Lexicographic order by display label is required.

Architecture review of #77 incorrectly recorded ADR 006 as a **narrow exception to ADR
004** for the list filter-editor Field drop-down. Human ruling: that reading was wrong.
ADR 004 does not govern PD lists of attribute **names**; framing lex order as a carve-out
mis-states the scope boundary and invites later tickets to treat name pickers as special
cases of layout order.

## Decision

1. **ADR 004 scope.** ADR 004 applies to ordering **attributes as laid-out data** — form
   fields, list columns, and equivalent presentations where order/grouping reflects the
   information model. It does **not** apply to pull-down lists whose options are bare
   names/labels for selection.
2. **Pull-down name lists.** Options in such PD lists **must** be sorted lexicographically
   by display label (case-insensitive unless a surface documents otherwise). This is
   expected and required, not an exception to ADR 004.
3. **No carve-out framing.** Do not treat lexicographic PD ordering as a per-ticket waiver
   of ADR 004. The prior ADR 006 (“filter-editor Field lex as ADR 004 exception”) is
   withdrawn and must not be cited.
4. **#77 scope unchanged.** Shipping lex order for the filter-editor Field drop-down is
   correct under this rule. Aligning the quick-filter field list to the same PD rule is
   desirable but **out of scope** for #77; address in a later change.

## Alternatives Considered

- **Keep ADR 006 as a #77-only exception to ADR 004.** Rejected by human ruling: wrong
  applicability; invents carve-out theatre for a scenario ADR 004 never covered.
- **Retire ADR 006 with no replacement.** Rejected as sufficient alone: without a positive
  PD-list rule, reviews may re-apply ADR 004 to name pickers; the human clarification should
  be standing intent.
- **Expand #77 to force quick-filter field lex order now.** Rejected for this ticket:
  acknowledged debt, separate change.

## Consequences

- Reviewers must not flag lexicographic attribute-**name** PD lists as ADR 004 violations.
- Form/list attribute layout remains ordinal-default per ADR 004; that path is unchanged.
- Quick-filter field ordering may still be non-lex until a dedicated follow-up; that is
  product debt under this ADR, not a license to invent ordinal PD name lists as policy.
- A later `review-arch` may add a short scope pointer beside ADR 004 in main docs; until
  then this ADR and ADR 004 together are the binding sources for the distinction.
- Primary agents must include this ADR file (and the deletion of the withdrawn ADR 006
  exception file) in commits with the related work; the human should be informed (may
  warrant later `review-arch`).
