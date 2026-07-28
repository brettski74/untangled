# Record editors own their undo stack

## Context

Issue #82 (slice 3 of epic #71) added in-place edit to the detail destination: dirty tracking,
Save, and Ctrl/Cmd+Z undo. Fields are React **controlled** inputs, so native per-field undo is
unreliable — the browser's text-control history fights values driven from application state.
Mixing native per-field undo with a page-level dirty/undo model would give operators two
conflicting mental models for one keystroke: sometimes the browser's history, sometimes the
form's.

The #82 plan chose one page-level stack and shipped it as **provisional**, with architecture
review flagging that #83 (new-record create) would inherit the model immediately, and related
lists, CMDB forms, and later editors after that. That is the same fragmentation exposure that
produced ADR 003 (record navigation) and ADR 005 (context-bar mount): silence invites each
surface to invent its own answer, and by then operators have learned three of them.

The human architect ruled that the model be recorded now as standing policy, **narrowly
scoped to record editors** — explicitly not a keyboard policy for every text surface in the
shell.

## Decision

Record editors over controlled fields use an **app-owned undo stack**, and Ctrl/Cmd+Z is
scoped to the editor.

1. **App-owned stack.** The editor owns an undo stack of chunks over its own draft state.
   Ctrl/Cmd+Z always means "pop a chunk" within an editor — never "maybe native undo, maybe
   application undo."
2. **Subtree scoping.** The editor handles Ctrl/Cmd+Z only within its form subtree (or when
   the event target is an editor-owned control), including suppressing the browser default on
   an empty stack. Shell chrome — omnibox, context-bar controls, list chrome, anything outside
   the editor — keeps **native** undo. A record editor must not install a document- or
   window-level undo handler.
3. **Chunking.** Contiguous edits to the same focused field merge into one chunk, so typing or
   deleting within one control is one undo step. A new chunk starts when focus or edit target
   changes. Exhausting the stack returns the draft to baseline, which is by definition clean.
4. **Buffer lifecycle.** Successful save and explicit user refresh clear the undo buffer and
   reset baseline. Undo history does not survive a new baseline; there is no undo across a
   persisted write.
5. **Save activation is a separate concern.** Ctrl/Cmd+S is a deliberate **page-level** Save
   activation, not part of the undo contract, and takes the same path as the Save control. It
   is registered only while the principal may perform the write (create or update as
   applicable) and torn down when that stops holding. The asymmetry with undo scoping is
   intentional: Save is a command about the record, undo is an interaction with a field.
6. **Fail closed on permission.** Without the applicable write permission the editor is
   read-only and registers neither undo nor save shortcuts. The API remains the authority on
   the write itself.

This is standing policy for record editors — detail (#82) and new-record (#83) share it, and
later record-editing surfaces adopt it rather than inventing a second model.

### Not in scope

Redo (Ctrl/Cmd+Y or equivalent); undo behaviour for shell, omnibox, and list chrome text
inputs, which keep native undo by point 2; optimistic concurrency and lost-update protection;
unsaved-navigation guards. Those remain open product decisions and this ADR neither settles
nor forecloses them.

## Alternatives Considered

- **Native per-field undo with no app stack.** Rejected: unreliable against controlled inputs,
  and it gives no page-level story for a form whose dirty state spans fields — the operator
  could undo text in one field while the form remained dirty from another with no way back.
- **Document- or window-level undo interception.** Rejected: a route-owned handler would steal
  Ctrl/Cmd+Z from shell chrome that legitimately relies on native undo, coupling shared chrome
  behaviour to whichever destination happens to be mounted.
- **Per-keystroke chunks (no merging).** Rejected: operators would press undo once per
  character, which is not what the gesture means anywhere else.
- **Keep the model provisional and per-ticket.** Rejected by human ruling: #83 lands
  immediately and would copy it, making it the de-facto contract without anyone deciding it —
  the failure mode ADRs 003 and 005 exist to prevent.
- **A general keyboard/interaction policy for the whole shell.** Rejected as premature scope:
  the evidence is about controlled record editors; other surfaces have not made their case.

## Consequences

- #83 and later record editors inherit the stack, chunking, subtree scoping, and clear-on-save
  semantics rather than re-deciding them. Shared editor helpers are the natural expression of
  that, but the contract is the behaviour, not a particular module.
- Undo scoping is now a testable claim, not a detail: a surface that captures Ctrl/Cmd+Z
  outside its own form subtree is non-conformant. Because that is awkward to unit test,
  reviewers should expect explicit coverage or manual verification of the boundary.
- Because the buffer clears on save, there is deliberately no cross-save undo. Operators who
  want to reverse a persisted change need a product-level answer (audit, revert), which this
  ADR does not provide.
- The Ctrl/Cmd+S page-level scope is recorded as intentional, so later reviews should not read
  the asymmetry with undo as an oversight; a surface wanting different Save-key behaviour is
  changing policy, not fixing a bug.
- A later `review-arch` may promote a short pointer into `principles.md` or `constraints.md`;
  until then this ADR is the binding source for the rule.
- Primary agents must include this ADR file in commits with the work that introduced it; the
  human should be informed (may warrant later `review-arch`).
