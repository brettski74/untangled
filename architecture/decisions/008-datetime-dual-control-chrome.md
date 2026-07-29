# Datetime controls use date + 24-hour time pairs

## Context

Issue #100 established consistent date/time formatting, display, and edit controls:
native date picker paired with 24-hour time text. Correct models already exist—detail
read-only dual chrome, and editable pairs in list quick-filter / filter-editor.

Issue #109 found that detail-form **editable** datetime fields still fell through to a
plain ISO text input (“temporary until write support”), shipping wrong chrome soon after
#100. Silence invites the next surface to invent plain ISO text, `datetime-local`, or a
third-party picker under the same excuse.

Human ruling on #109: lock a **product-wide** datetime control requirement in architecture
intent (this ADR) and a concise agent-facing rule in `AGENTS.md` (implement applies the
latter). This ticket restores detail write support in place and does not modify list or
filter UI; the rule still binds future work.

## Decision

1. **Product chrome.** Editable datetime controls product-wide, and detail-form datetime
   in **both** editable and read-only modes, use **native date picker + 24-hour time text**
   dual-control chrome. Do not use a plain ISO (or similar) single text field,
   `datetime-local`, or third-party date/time pickers for those surfaces.
2. **Models of correctness.** Existing correct models are detail read-only dual chrome and
   list quick-filter / filter-editor editable date + time pairs. New work matches that
   pattern rather than inventing a parallel widget family.
3. **Allowed exception.** Dense, **non-editable** list-cell display may remain plain local
   datetime text for compactness. That exception does **not** justify wrong chrome on
   editable controls or on detail-form datetime (any mode).
4. **Editor concerns stay orthogonal.** Detail record-editor undo/save chunking and
   partial/invalid intermediate input must be solved inside the existing editor contract
   without adopting a divergent datetime widget family.
5. **Division of docs.** This ADR is binding architecture intent (rationale and standing
   policy). `AGENTS.md` carries only a short agent-facing restatement of the rule—no
   ADR paths in tickets or agent prompts; do not duplicate full Context/Alternatives there.

## Alternatives Considered

- **Leave chrome unspecified; fix #109 only.** Rejected by human ruling: #100 already set
  the model and editable detail still regressed; without a durable lock the next surface
  will repeat “temporary until write support.”
- **Allow `datetime-local` or a shared third-party picker for editable detail.** Rejected:
  fragments operator experience from existing date + 24-hour time pairs and drifts from
  #100’s direction.
- **Require dual chrome on dense list cells too.** Rejected: compact non-editable display
  is a deliberate density choice; the exception is narrow and must stay narrow.
- **Invent a detail-only write widget to satisfy undo/invalid-input.** Rejected: editor
  concerns do not license a second datetime chrome family (consistency above all).

## Consequences

- #109 restores write support on the existing detail dual-control chrome; list/filter UI
  stay unchanged for that ticket while remaining reference models.
- Later datetime surfaces (new editors, filters, create flows, etc.) must ship the date +
  24-hour time pair unless they qualify for exception as dense non-editable list-cell or 
  inline text.
- Implement must add a concise `AGENTS.md` bullet matching Decision points 1–3 (rule +
  exception only); this ADR remains the place for rationale and non-goals.
- Later `review-arch` may add a short pointer in main architecture docs; until then this
  ADR is the binding source for the rule.
- Primary agents must include this ADR file in commits with the related work; the human
  should be informed (may warrant later `review-arch`).
